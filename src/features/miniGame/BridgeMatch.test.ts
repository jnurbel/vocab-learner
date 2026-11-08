import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import BridgeMatch from './BridgeMatch.svelte';
import { startBridgeMatchSession, type BridgeMatchSelection } from './bridgeMatchSession';
import { fakeSpeaker } from './miniGame.fixtures';

const morning = new Date('2026-11-06T08:00:00Z');
const meanings = ['chat', 'chien', 'oiseau', 'poisson'];
const sounds = ['māo', 'gǒu', 'niǎo', 'yú'];
const words = meanings.map((meaning, index) =>
  card(`w${String(index)}`, undefined, {
    term: `词${String(index)}`,
    pinyin: sounds[index] ?? '',
    translation: meaning,
  }),
);

function setup({
  speaker = fakeSpeaker(false),
  cardIds,
}: { speaker?: ReturnType<typeof fakeSpeaker>; cardIds?: string[] } = {}) {
  const store = new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });
  const onSessionEnd = vi.fn();
  const startSession = vi.fn((selection: BridgeMatchSelection) =>
    startBridgeMatchSession(selection, {
      store,
      srs,
      clock: () => morning,
      newId: () => 'b1',
    }),
  );
  render(BridgeMatch, {
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

const leftBank = () => screen.getByRole('group', { name: 'Rive des mots' });
const rightBank = () => screen.getByRole('group', { name: 'Rive des sens' });
const wordButton = (word: Card) => within(leftBank()).getByRole('button', { name: word.term });
const meaningButton = (word: Card) =>
  within(rightBank()).getByRole('button', { name: word.translation });

async function begin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Commencer' }));
  await screen.findByText(/Plateau 1/);
}

const soundBank = () => screen.getByRole('group', { name: 'Rive des sons' });

describe('BridgeMatch', () => {
  it('unlocks the speech in the click on Start, before any await, so that phones play it', async () => {
    const { speaker, user } = setup({ speaker: fakeSpeaker(true) });
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

  it('links a word to its meaning with two clicks and lays a plank', async () => {
    const { user, store } = setup();
    await begin(user);
    const [first] = words as [Card];

    await user.click(wordButton(first));
    expect(wordButton(first)).toHaveAttribute('aria-pressed', 'true');
    await user.click(meaningButton(first));

    expect(await screen.findByText(/Paire juste : 词0, chat\. 1 sur 4\./)).toBeVisible();
    expect(wordButton(first)).toBeDisabled();
    expect(store.answers[0]?.result).toMatchObject({ exercise: 'bridgeMatch', outcome: 'correct' });
  });

  it('turns both cards back after a wrong link, storing nothing', async () => {
    const { user, store } = setup();
    await begin(user);
    const [first, second] = words as [Card, Card];

    await user.click(meaningButton(second));
    await user.click(wordButton(first));

    expect(await screen.findByText('Pas une paire : 词0 et chien.')).toBeVisible();
    expect(wordButton(first)).toHaveAttribute('aria-pressed', 'false');
    expect(meaningButton(second)).toHaveAttribute('aria-pressed', 'false');
    expect(wordButton(first)).toBeEnabled();
    expect(store.answers).toEqual([]);
  });

  it('links with the keyboard: the number of the word, then the letter of the meaning', async () => {
    const { user, store } = setup();
    await begin(user);
    const left = within(leftBank()).getAllByRole('button');
    const right = within(rightBank()).getAllByRole('button');
    const firstWord = words.find((each) => left[0]?.textContent.includes(each.term));
    const letter = 'abcd'.charAt(
      right.findIndex((button) => button.textContent.includes(firstWord?.translation ?? '?')),
    );

    await user.keyboard(`1${letter}`);

    expect(await screen.findByText(/Paire juste/)).toBeVisible();
    expect(store.answers).toHaveLength(1);
  });

  it('plays the word of a sound card when it is chosen, after unlocking the speech', async () => {
    const speaker = fakeSpeaker(true);
    const { user } = setup({ speaker });
    await begin(user);
    const sound = within(soundBank()).getByRole('button', { name: 'Son 1' });
    speaker.unlock.mockClear();

    await user.click(sound);

    expect(speaker.unlock).toHaveBeenCalled();
    const spoken = speaker.speak.mock.calls.at(-1)?.[0];
    expect(words.map(({ term }) => term)).toContain(spoken);
    expect(speaker.unlock.mock.invocationCallOrder[0]).toBeLessThan(
      speaker.speak.mock.invocationCallOrder.at(-1) ?? 0,
    );
  });

  it('replays the chosen sound slowly at the slow rate of the chosen speed', async () => {
    const speaker = fakeSpeaker(true);
    const { user } = setup({ speaker });
    await begin(user);
    await user.click(within(soundBank()).getByRole('button', { name: 'Son 1' }));

    await user.keyboard('l');

    expect(speaker.speak.mock.calls.at(-1)?.[2]).toEqual({ rate: 0.4 });
  });

  it('shows the summary once every pair is linked, and tells the app', async () => {
    const { user, onSessionEnd } = setup();
    await begin(user);

    for (const each of words) {
      await user.click(wordButton(each));
      await user.click(meaningButton(each));
    }

    expect(await screen.findByRole('heading', { name: 'Pont terminé' })).toBeVisible();
    expect(screen.getByText('4 / 4 paires du premier coup')).toBeVisible();
    expect(onSessionEnd).toHaveBeenCalledOnce();
  });

  it('plays the imposed words when a step session gives them', async () => {
    const { user, startSession } = setup({ cardIds: ['w1', 'w2'] });

    await user.click(screen.getByRole('button', { name: 'Commencer' }));

    await vi.waitFor(() => {
      expect(startSession).toHaveBeenCalledWith(
        expect.objectContaining({ cardIds: ['w1', 'w2'], language: 'zh', voice: false }),
      );
    });
  });

  it('says so when the words cannot fill a board', async () => {
    const store = new FakeStore();
    render(BridgeMatch, {
      cards: words.slice(0, 2),
      language: 'zh',
      speaker: fakeSpeaker(false),
      speechRate: 0.7,
      startSession: (selection: BridgeMatchSelection) =>
        startBridgeMatchSession(selection, { store, srs, clock: () => morning, newId: () => 'b' }),
      onSessionEnd: vi.fn(),
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByText('Il faut au moins 3 mots de sens différents.')).toBeVisible();
  });
});
