import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { fakeSpeaker } from './miniGame.fixtures';
import type { MiniGameSelection } from './miniGameRecorder';
import SentenceShuffle from './SentenceShuffle.svelte';
import { startSentenceShuffleSession } from './sentenceShuffleSession';

const morning = new Date('2026-11-06T08:00:00Z');
const cat = card('cat', undefined, {
  language: 'en',
  term: 'cat',
  translation: 'chat',
  example: 'I like my cat.',
});
const CHUNKS = ['I', 'like', 'my', 'cat.'];
const words: Card[] = [cat];

function setup({
  speaker = fakeSpeaker(true),
  level = 1,
  cardIds,
}: { speaker?: ReturnType<typeof fakeSpeaker>; level?: 1 | 2 | 3; cardIds?: string[] } = {}) {
  const store = new FakeStore(
    { reviewStates: words.map(({ id }) => reviewed(id)) },
    { gameLevels: { 'sentenceShuffle:en': { level, window: [] } } },
  );
  const onSessionEnd = vi.fn();
  const startSession = vi.fn((selection: MiniGameSelection) =>
    startSentenceShuffleSession(selection, { store, srs, clock: () => morning, newId: () => 's' }),
  );
  render(SentenceShuffle, {
    cards: words,
    language: 'en',
    ...(cardIds === undefined ? {} : { cardIds }),
    speaker,
    speechRate: 0.7,
    startSession,
    onSessionEnd,
  });
  return { store, speaker, onSessionEnd, startSession, user: userEvent.setup() };
}

const reserve = () => screen.getByRole('group', { name: 'Morceaux à placer' });
const line = () => screen.getByRole('group', { name: 'Ta phrase' });

async function begin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Commencer' }));
  await screen.findByRole('group', { name: 'Morceaux à placer' });
}

async function place(user: ReturnType<typeof userEvent.setup>, chunks: readonly string[]) {
  for (const chunk of chunks) {
    await user.click(within(reserve()).getByRole('button', { name: chunk }));
  }
}

describe('SentenceShuffle', () => {
  it('unlocks the speech in the click on Start, before any await, so that phones play it', async () => {
    const { speaker, user } = setup();
    let unlockedFirst = false;
    speaker.hasVoice.mockImplementation(() => {
      unlockedFirst = speaker.unlock.mock.calls.length > 0;
      return Promise.resolve(true);
    });

    await user.click(screen.getByRole('button', { name: 'Commencer' }));

    await vi.waitFor(() => {
      expect(speaker.hasVoice).toHaveBeenCalled();
    });
    expect(unlockedFirst).toBe(true);
  });

  it('puts the tiles tapped on the line, and says "Juste." for the sentence in order', async () => {
    const { user, store } = setup();
    await begin(user);

    await place(user, CHUNKS);
    expect(
      within(line())
        .getAllByRole('button')
        .map((tile) => tile.textContent.trim()),
    ).toEqual(CHUNKS);
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Juste.');
    expect(store.answers[0]?.result).toMatchObject({
      exercise: 'sentenceShuffle',
      outcome: 'correct',
    });
  });

  it('takes a tile back to the reserve when it is tapped on the line', async () => {
    const { user } = setup();
    await begin(user);
    await place(user, ['I']);

    await user.click(within(line()).getByRole('button', { name: 'I' }));

    expect(within(line()).queryAllByRole('button')).toEqual([]);
    expect(within(reserve()).getByRole('button', { name: 'I' })).toBeVisible();
  });

  it('places with numbers, takes back with Backspace and validates with Enter', async () => {
    const { user, store } = setup();
    await begin(user);
    const numberOf = (chunk: string) =>
      String(
        within(reserve())
          .getAllByRole('button')
          .findIndex((tile) => tile.textContent.includes(chunk)) + 1,
      );

    await user.keyboard(numberOf('like'));
    await user.keyboard('{Backspace}');
    for (const chunk of CHUNKS) {
      await user.keyboard(numberOf(chunk));
    }
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('Juste.');
    expect(store.answers).toHaveLength(1);
  });

  it('keeps the right start after a wrong try, and lets the learner claim to be right', async () => {
    const { user, store } = setup();
    await begin(user);

    await place(user, ['I', 'my', 'like', 'cat.']);
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText(/le début en vert est juste/)).toBeVisible();
    expect(
      within(line())
        .getAllByRole('button')
        .map((tile) => tile.textContent.trim()),
    ).toEqual(['I']);
    expect(store.answers).toEqual([]);
    await user.click(screen.getByRole('button', { name: "J'étais juste" }));

    expect(store.answers[0]?.result.outcome).toBe('correct');
  });

  it('reads the sentence at the start at level 1, slowly at the slow rate on L', async () => {
    const { user, speaker } = setup();
    await begin(user);

    expect(speaker.speak).toHaveBeenCalledWith('I like my cat.', 'en', undefined);
    await user.keyboard('l');
    expect(speaker.speak.mock.calls.at(-1)).toEqual(['I like my cat.', 'en', { rate: 0.4 }]);
  });

  it('keeps the sentence silent until validated at level 3', async () => {
    const { user, speaker } = setup({ level: 3 });
    await begin(user);

    expect(speaker.speak).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Écouter la phrase' })).toBeNull();
  });

  it('shows the summary at the end of the round', async () => {
    const { user, onSessionEnd } = setup();
    await begin(user);
    await place(user, CHUNKS);
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));

    expect(await screen.findByRole('heading', { name: 'Phrases remises en ordre' })).toBeVisible();
    expect(onSessionEnd).toHaveBeenCalledOnce();
  });

  it('says so without a sentence to put back, and passes the imposed words', async () => {
    const { user, startSession } = setup({ cardIds: ['nope'] });

    await user.click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByText(/Ajoute des phrases d'exemple de 3 à 8 morceaux/)).toBeVisible();
    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ cardIds: ['nope'] }));
  });
});
