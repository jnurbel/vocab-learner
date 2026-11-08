import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card, Language } from '../../domain/card';
import { card, FakeStore, srs } from '../flashcards/flashcards.fixtures';
import { fakeSpeaker } from './miniGame.fixtures';
import ToneEcho from './ToneEcho.svelte';
import { startToneEchoSession } from './toneEchoSession';
import type { MiniGameSelection } from './miniGameRecorder';

const morning = new Date('2026-11-06T08:00:00Z');
const time = card('time', undefined, { term: '时间', pinyin: 'shíjiān', translation: 'temps' });
const cat = card('cat', undefined, { term: '猫', pinyin: 'māo', translation: 'chat' });
const sheep = card('sheep', undefined, { language: 'en', term: 'sheep', translation: 'mouton' });

function setup({
  cards = [time, cat],
  language = 'zh',
  cardIds,
  speaker = fakeSpeaker(true),
}: {
  cards?: Card[];
  language?: Language;
  cardIds?: string[];
  speaker?: ReturnType<typeof fakeSpeaker>;
} = {}) {
  const store = new FakeStore();
  const onSessionEnd = vi.fn();
  render(ToneEcho, {
    cards,
    language,
    ...(cardIds === undefined ? {} : { cardIds }),
    speaker,
    speechRate: 0.9,
    startSession: (selection: MiniGameSelection) =>
      startToneEchoSession(selection, { store, srs, clock: () => morning, newId: () => 't1' }),
    onSessionEnd,
  });
  return { store, speaker, onSessionEnd, user: userEvent.setup() };
}

async function begin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Commencer' }));
  await screen.findByText(/Échos · 1 \/ 10/);
}

const spoken = (speaker: ReturnType<typeof fakeSpeaker>) =>
  speaker.speak.mock.calls.map(([text]) => text);

describe('ToneEcho', () => {
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

  it('reads a word and accepts its tones typed as digits', async () => {
    const { user, speaker, store } = setup();
    await begin(user);
    expect(spoken(speaker)).toEqual(['时间']);

    await user.type(screen.getByRole('textbox', { name: 'Tons du mot' }), '21{Enter}');

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent('Juste.');
    expect(feedback).toHaveTextContent('时间');
    expect(feedback).toHaveTextContent('temps');
    expect(store.answers[0]?.result).toMatchObject({ exercise: 'toneEcho', outcome: 'correct' });
  });

  it('draws the tones heard and chosen after a wrong answer, and waits to go on', async () => {
    const { user } = setup();
    await begin(user);

    await user.type(screen.getByRole('textbox', { name: 'Tons du mot' }), '44{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tu as entendu shíjiān, tu as choisi : 4e ton puis 4e ton',
    );
    expect(screen.getByRole('img', { name: 'Tons : 2e ton puis 1er ton' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Tons : 4e ton puis 4e ton' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continuer' })).toHaveFocus();
  });

  it('explains the third tone sandhi when a word has two third tones', async () => {
    const hello = card('hello', undefined, {
      term: '你好',
      pinyin: 'nǐhǎo',
      translation: 'bonjour',
    });
    const { user } = setup({ cards: [hello] });
    await begin(user);

    await user.type(screen.getByRole('textbox', { name: 'Tons du mot' }), '23{Enter}');

    expect(await screen.findByText(/deux 3e tons de suite deviennent/)).toBeVisible();
  });

  it('asks the tone of a syllable with the keys, the neutral tone on 0', async () => {
    const { user, store } = setup({ cardIds: ['cat'] });
    await begin(user);
    expect(screen.getByRole('group', { name: 'Tons' })).toBeVisible();

    await user.keyboard('0');

    expect(await screen.findByRole('status')).toHaveTextContent('Tu as entendu māo');
    expect(store.answers[0]?.result).toMatchObject({ outcome: 'wrong', answer: '5' });
  });

  it('replays the two words of a pair, one after the other, after a wrong choice', async () => {
    const { user, speaker } = setup({ cards: [sheep], language: 'en' });
    await begin(user);
    const heard = spoken(speaker).at(-1);
    const pair = screen.getByRole('group', { name: 'Les deux mots' });
    const other = within(pair)
      .getAllByRole('button')
      .find((button) => !button.textContent.includes(heard ?? '?'));

    if (other === undefined) {
      throw new Error('No other word in the pair');
    }
    await user.click(other);

    await vi.waitFor(() => {
      expect(spoken(speaker).slice(-2)).toEqual([heard, heard === 'ship' ? 'sheep' : 'ship']);
    });
    expect(await screen.findByRole('button', { name: 'Écouter mon choix' })).toBeVisible();
  });

  it('replays slowly at the slow rate of the chosen speed', async () => {
    const { user, speaker } = setup({ cardIds: ['cat'] });
    await begin(user);

    await user.keyboard('l');

    expect(speaker.speak.mock.calls.at(-1)).toEqual(['猫', 'zh', { rate: 0.45 }]);
  });

  it('goes to the summary at the end of the round', async () => {
    const { user, onSessionEnd } = setup({ cardIds: ['cat'] });
    await begin(user);

    for (let index = 0; index < 10; index++) {
      await user.keyboard('1');
      await screen.findByRole('status');
      await user.click(screen.getByRole('button', { name: 'Continuer' }));
    }

    expect(await screen.findByRole('heading', { name: 'Échos terminés' })).toBeVisible();
    expect(screen.getByText('10 / 10 justes')).toBeVisible();
    expect(onSessionEnd).toHaveBeenCalledOnce();
  });

  it('says that the game needs a voice when there is none', async () => {
    const { user } = setup({ speaker: fakeSpeaker(false) });

    await user.click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByText(/Ce jeu a besoin d'une voix/)).toBeVisible();
  });
});
