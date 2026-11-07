import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Speaker } from '../../services/tts/speaker';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import ListenMeaning from './ListenMeaning.svelte';
import { startListenMeaningSession, type ListenMeaningSelection } from './listenMeaningSession';

const morning = new Date('2026-11-06T08:00:00Z');
const meanings = ['chat', 'chien', 'oiseau', 'poisson', 'cheval'];
/** Distinct sounds: exact homophones are never offered together. */
const sounds = ['māo', 'gǒu', 'niǎo', 'yú', 'mǎ'];
const words = meanings.map((meaning, index) =>
  card(`w${String(index)}`, undefined, {
    term: `词${String(index)}`,
    pinyin: sounds[index] ?? '',
    translation: meaning,
  }),
);

function fakeSpeaker(withVoice = true) {
  return {
    hasVoice: vi.fn<Speaker['hasVoice']>(() => Promise.resolve(withVoice)),
    speak: vi.fn<Speaker['speak']>(() => Promise.resolve()),
    cancel: vi.fn(),
  } satisfies Speaker;
}

function setup({
  cards = words,
  speaker = fakeSpeaker(),
}: { cards?: Card[]; speaker?: ReturnType<typeof fakeSpeaker> } = {}) {
  const store = new FakeStore({ reviewStates: cards.map(({ id }) => reviewed(id)) });
  const onSessionEnd = vi.fn();
  render(ListenMeaning, {
    cards,
    speaker,
    startSession: (selection: ListenMeaningSelection) =>
      startListenMeaningSession(selection, { store, srs, clock: () => morning, newId: () => 'g1' }),
    onSessionEnd,
  });
  return { store, speaker, onSessionEnd, user: userEvent.setup() };
}

/** The word last spoken, found from what the speaker read: never from the options' order. */
function spokenWord(speaker: ReturnType<typeof fakeSpeaker>): Card {
  const term = speaker.speak.mock.calls.at(-1)?.[0];
  const word = words.find((each) => each.term === term);
  if (word === undefined) {
    throw new Error(`Nothing spoken: ${String(term)}`);
  }
  return word;
}

const options = () => screen.getByRole('group', { name: 'Que veut dire ce mot ?' });
const optionOf = (word: Card) => within(options()).getByRole('button', { name: word.translation });

async function begin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Commencer le mini-jeu' }));
}

describe('ListenMeaning', () => {
  it('speaks the word without writing it, then offers its meaning among 3 or 4', async () => {
    const { user, speaker } = setup();
    await begin(user);

    await vi.waitFor(() => {
      expect(speaker.speak).toHaveBeenCalled();
    });
    const target = spokenWord(speaker);
    expect(screen.queryByText(target.term)).toBeNull();
    const buttons = within(options()).getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    expect(buttons.length).toBeLessThanOrEqual(4);
    expect(optionOf(target)).toBeVisible();
  });

  it('says "Juste." with the whole word after a right choice', async () => {
    const { user, speaker } = setup();
    await begin(user);
    await vi.waitFor(() => {
      expect(speaker.speak).toHaveBeenCalled();
    });
    const target = spokenWord(speaker);

    await user.click(optionOf(target));

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent(`Juste. ${target.term}`);
    expect(feedback).toHaveTextContent(target.translation);
  });

  it('tells the right word and the one chosen after a wrong choice, and waits to go on', async () => {
    const { user, speaker } = setup();
    await begin(user);
    await vi.waitFor(() => {
      expect(speaker.speak).toHaveBeenCalled();
    });
    const target = spokenWord(speaker);
    const wrong = within(options())
      .getAllByRole('button')
      .find((button) => !button.textContent.includes(target.translation));
    const chosen = words.find((each) => wrong?.textContent.includes(each.translation));
    if (wrong === undefined || chosen === undefined) {
      throw new Error('No wrong option');
    }

    await user.click(wrong);

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent(`C'était ${target.term}`);
    expect(feedback).toHaveTextContent(`Tu as choisi : ${chosen.translation} = ${chosen.term}`);
    // The right word is spoken again, and nothing goes on by itself.
    expect(spokenWord(speaker)).toEqual(target);
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('chooses with the keys, replays with R or Space, slowly with L, and 0 does not know', async () => {
    const { user, speaker } = setup();
    await begin(user);
    await vi.waitFor(() => {
      expect(speaker.speak).toHaveBeenCalledTimes(1);
    });

    await user.keyboard('r');
    await user.keyboard(' ');
    await user.keyboard('l');

    expect(speaker.speak).toHaveBeenCalledTimes(4);
    expect(speaker.speak.mock.calls.at(-1)?.[2]).toEqual({ rate: 0.6 });

    await user.keyboard('0');
    expect(await screen.findByRole('status')).toHaveTextContent("C'était");
    await user.keyboard('{Enter}');
    // The wrong answer replayed the word (5), the next question speaks its own (6).
    await vi.waitFor(() => {
      expect(speaker.speak).toHaveBeenCalledTimes(6);
    });

    const target = spokenWord(speaker);
    const index = within(options())
      .getAllByRole('button')
      .findIndex((button) => button.textContent.includes(target.translation));
    await user.keyboard(String(index + 1));
    expect(await screen.findByRole('status')).toHaveTextContent('Juste.');
  });

  it('shows the hanzi without pinyin when there is no voice', async () => {
    const { user } = setup({ speaker: fakeSpeaker(false) });
    await begin(user);

    expect(await screen.findByText('Pas de voix : le mot est écrit, sans pinyin.')).toBeVisible();
    const written = screen.getByTestId('written-word');
    expect(written).toHaveAttribute('lang', 'zh-CN');
    expect(written.textContent).toMatch(/^词\d$/);
    expect(screen.queryByText(/^(māo|gǒu|niǎo|yú|mǎ)$/)).toBeNull();
  });

  it('shows the pinyin as a hint, which counts as an answer with hint', async () => {
    const { user, speaker, store } = setup();
    await begin(user);
    await vi.waitFor(() => {
      expect(speaker.speak).toHaveBeenCalled();
    });
    const target = spokenWord(speaker);

    await user.click(screen.getByRole('button', { name: 'Voir le pinyin (indice)' }));
    expect(screen.getByText(target.pinyin ?? '')).toBeVisible();
    await user.click(optionOf(target));

    await screen.findByRole('status');
    expect(store.answers[0]?.result).toMatchObject({ outcome: 'correctWithHint', hintsUsed: 1 });
  });

  it('shows the score and the points at the end of the round', async () => {
    const { user, speaker, onSessionEnd } = setup();
    await begin(user);
    for (let item = 0; item < words.length; item++) {
      await vi.waitFor(() => {
        expect(speaker.speak).toHaveBeenCalledTimes(item + 1);
      });
      await user.click(optionOf(spokenWord(speaker)));
      await screen.findByRole('status');
      await user.keyboard('{Enter}');
    }

    expect(await screen.findByRole('heading', { name: 'Mini-jeu terminé' })).toBeVisible();
    expect(screen.getByText('5 / 5 justes')).toBeVisible();
    expect(screen.getByText(/^\+\d+ XP$/)).toBeVisible();
    expect(onSessionEnd).toHaveBeenCalledOnce();
  });

  it('explains that a single word is not enough', async () => {
    const { user } = setup({ cards: words.slice(0, 1) });
    await begin(user);

    expect(
      await screen.findByText('Il faut au moins 2 mots dans cette langue pour ce mini-jeu.'),
    ).toBeVisible();
  });
});
