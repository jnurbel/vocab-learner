import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { fakeSpeaker } from './miniGame.fixtures';
import type { MiniGameSelection } from './miniGameRecorder';
import SentenceListen from './SentenceListen.svelte';
import { startSentenceListenSession } from './sentenceListenSession';

const morning = new Date('2026-11-06T08:00:00Z');
const time = card('time', undefined, {
  term: '时间',
  pinyin: 'shíjiān',
  translation: 'temps',
  example: '我没有时间。',
});
const others = [
  card('cat', undefined, { term: '猫', pinyin: 'māo', translation: 'chat' }),
  card('dog', undefined, { term: '狗', pinyin: 'gǒu', translation: 'chien' }),
  card('bird', undefined, { term: '鸟', pinyin: 'niǎo', translation: 'oiseau' }),
];
const words: Card[] = [time, ...others];

function setup({
  speaker = fakeSpeaker(true),
  cardIds,
}: { speaker?: ReturnType<typeof fakeSpeaker>; cardIds?: string[] } = {}) {
  const store = new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });
  const onSessionEnd = vi.fn();
  const startSession = vi.fn((selection: MiniGameSelection) =>
    startSentenceListenSession(selection, { store, srs, clock: () => morning, newId: () => 's1' }),
  );
  render(SentenceListen, {
    cards: words,
    language: 'zh',
    ...(cardIds === undefined ? {} : { cardIds }),
    speaker,
    speechRate: 0.7,
    startSession,
    onSessionEnd,
  });
  return { store, speaker, onSessionEnd, startSession, user: userEvent.setup() };
}

const options = () => screen.getByRole('group', { name: 'Quel mot de ta liste as-tu entendu ?' });

async function begin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Commencer' }));
  await screen.findByRole('group', { name: 'Quel mot de ta liste as-tu entendu ?' });
}

describe('SentenceListen', () => {
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

  it('reads the example sentence without writing it, and offers written words', async () => {
    const { user, speaker } = setup();
    await begin(user);

    expect(speaker.speak).toHaveBeenCalledWith('我没有时间。', 'zh', undefined);
    expect(screen.queryByText('我没有时间。')).toBeNull();
    expect(within(options()).getByRole('button', { name: '时间' })).toBeVisible();
    expect(within(options()).getAllByRole('button').length).toBeGreaterThanOrEqual(3);
  });

  it('shows the whole sentence with the word marked after a right choice', async () => {
    const { user, store } = setup();
    await begin(user);

    await user.click(within(options()).getByRole('button', { name: '时间' }));

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent('Juste.');
    expect(feedback).toHaveTextContent('我没有时间。');
    expect(within(feedback).getByText('时间', { selector: 'mark' })).toBeVisible();
    expect(store.answers[0]?.result).toMatchObject({
      exercise: 'sentenceListen',
      outcome: 'correct',
    });
  });

  it('tells the word heard after a wrong choice, and waits to go on', async () => {
    const { user } = setup();
    await begin(user);
    const wrong = within(options())
      .getAllByRole('button')
      .find((button) => !button.textContent.includes('时间'));
    if (wrong === undefined) {
      throw new Error('No wrong option');
    }

    await user.click(wrong);

    expect(await screen.findByRole('status')).toHaveTextContent("C'était 时间");
    expect(screen.getByRole('button', { name: 'Continuer' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Réécouter la phrase' })).toBeVisible();
  });

  it('chooses with the keys and replays slowly at the slow rate of the chosen speed', async () => {
    const { user, speaker, store } = setup();
    await begin(user);

    await user.keyboard('l');
    expect(speaker.speak.mock.calls.at(-1)).toEqual(['我没有时间。', 'zh', { rate: 0.4 }]);
    await user.keyboard('0');

    expect(await screen.findByRole('status')).toHaveTextContent("C'était 时间");
    expect(store.answers[0]?.result.outcome).toBe('wrong');
  });

  it('shows the sentence with a gap when no voice can read it', async () => {
    const { user } = setup({ speaker: fakeSpeaker(false) });
    await begin(user);

    expect(screen.getByText('我没有＿＿。')).toBeVisible();
  });

  it('plays the imposed words when a step session gives them', async () => {
    const { user, startSession } = setup({ cardIds: ['time'] });

    await begin(user);

    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ cardIds: ['time'] }));
  });

  it('shows the summary at the end of the round', async () => {
    const { user, onSessionEnd } = setup();
    await begin(user);

    await user.click(within(options()).getByRole('button', { name: '时间' }));
    await user.click(await screen.findByRole('button', { name: 'Continuer' }));

    expect(await screen.findByRole('heading', { name: 'Phrases écoutées' })).toBeVisible();
    expect(onSessionEnd).toHaveBeenCalledOnce();
  });
});
