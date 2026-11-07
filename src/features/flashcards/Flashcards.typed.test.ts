import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { PinyinGenerator } from '../../domain/pinyinGeneration';
import type { AnswerMode } from '../../domain/studySettings';
import fr from '../../i18n/fr.json';
import type { Speaker } from '../../services/tts/speaker';
import { startPracticeSession } from '../practice/practiceSession';
import { card, FakeStore, reviewed, srs } from './flashcards.fixtures';
import Flashcards from './Flashcards.svelte';
import {
  loadStudyOutlook,
  startFlashcardSession,
  type FlashcardSelection,
} from './flashcardSession';

const morning = new Date('2026-11-06T08:00:00Z');
const ACCEPT = fr.typed.accept;
const fakePinyin: PinyinGenerator = (hanzi) => hanzi;

function fakeSpeaker() {
  return {
    hasVoice: vi.fn<Speaker['hasVoice']>(() => Promise.resolve(true)),
    speak: vi.fn<Speaker['speak']>(() => Promise.resolve()),
    cancel: vi.fn(),
  } satisfies Speaker;
}

const cat = card('cat', '2026-10-01T00:00:00.000Z', {
  term: '猫',
  pinyin: 'māo',
  translation: 'chat',
});
const dog = card('dog', '2026-10-02T00:00:00.000Z', {
  term: '狗',
  pinyin: 'gǒu',
  translation: 'chien',
});
const BY_TERM = new Map([cat, dog].map((word) => [word.term, word]));
const BY_MEANING = new Map([cat, dog].map((word) => [word.translation, word]));

function setup({
  cards = [cat, dog],
  answerMode = 'selfAssess',
}: { cards?: Card[]; answerMode?: AnswerMode } = {}) {
  // Both words are due today: answers are rated, never counted as discoveries.
  const store = new FakeStore({ reviewStates: cards.map(({ id }) => reviewed(id)) });
  const speaker = fakeSpeaker();
  const onAnswerModeChange = vi.fn<(mode: AnswerMode) => Promise<void>>(() => Promise.resolve());
  render(Flashcards, {
    cards,
    labels: [],
    startSession: (selection: FlashcardSelection) =>
      startFlashcardSession(selection, { store, srs, clock: () => morning, newId: () => 's1' }),
    startPractice: (selection: FlashcardSelection) =>
      startPracticeSession(selection, { store, clock: () => morning, newId: () => 'p1' }),
    loadOutlook: (selection: FlashcardSelection) =>
      loadStudyOutlook(selection, { store, srs, clock: () => morning }),
    loadPinyin: () => Promise.resolve(fakePinyin),
    speaker,
    answerMode,
    onAnswerModeChange,
    onSessionEnd: vi.fn(),
  });
  return { store, speaker, onAnswerModeChange, user: userEvent.setup() };
}

const modeRadio = (name: string) => screen.getByRole('radio', { name });

/** The card shown, whichever comes first: the queue order is never assumed. */
function shownCard(): Card {
  const region = within(screen.getByRole('region', { name: fr.flashcards.title }));
  for (const [text, word] of [...BY_TERM, ...BY_MEANING]) {
    if (region.queryByText(text) !== null) {
      return word;
    }
  }
  throw new Error('No card shown');
}

describe('Flashcards answered by typing', () => {
  it('offers four ways to answer, rating oneself by default, the word named after the language', async () => {
    const { user } = setup();

    expect(modeRadio(fr.flashcards.answerModes.selfAssess)).toBeChecked();
    expect(modeRadio(fr.flashcards.answerModes.typeMeaning)).not.toBeChecked();
    expect(modeRadio(fr.flashcards.answerModes.typeWord.zh)).toBeInTheDocument();
    expect(modeRadio(fr.flashcards.answerModes.mixed)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: fr.languages.en }));

    expect(modeRadio(fr.flashcards.answerModes.typeWord.en)).toBeInTheDocument();
  });

  it('starts with the way of answering the learner chose last time', () => {
    setup({ answerMode: 'typeWord' });

    expect(modeRadio(fr.flashcards.answerModes.typeWord.zh)).toBeChecked();
  });

  it('remembers a new choice when a session starts, and only then', async () => {
    const { user, onAnswerModeChange } = setup();

    await user.click(modeRadio(fr.flashcards.answerModes.typeMeaning));
    expect(onAnswerModeChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(onAnswerModeChange).toHaveBeenCalledWith('typeMeaning');
  });

  it('does not save the choice again when it did not change', async () => {
    const { user, onAnswerModeChange } = setup({ answerMode: 'typeMeaning' });

    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(onAnswerModeChange).not.toHaveBeenCalled();
  });

  it('asks the meaning of each word, stores it as typeMeaning, then moves on until the end', async () => {
    const { user, store, speaker } = setup({ answerMode: 'typeMeaning' });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    for (let index = 0; index < 2; index += 1) {
      const field = await screen.findByLabelText(fr.typed.answerLabel);
      const word = shownCard();
      expect(screen.queryByRole('button', { name: fr.flashcards.flip })).toBeNull();
      expect(speaker.speak).toHaveBeenCalledWith(word.term, 'zh');
      await user.type(field, `${word.translation}{Enter}`);
      expect(await screen.findByText(fr.dictation.correct)).toBeVisible();
      await user.click(screen.getByRole('button', { name: fr.dictation.continue }));
    }

    expect(await screen.findByText(fr.flashcards.summaryTitle)).toBeVisible();
    expect(store.answers.map(({ result }) => [result.exercise, result.rating])).toEqual([
      ['typeMeaning', 'good'],
      ['typeMeaning', 'good'],
    ]);
  });

  it('replaces the "again" of a wrong meaning by a single "good" with "J\'avais bon"', async () => {
    const { user, store } = setup({ cards: [cat], answerMode: 'typeMeaning' });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    await user.type(await screen.findByLabelText(fr.typed.answerLabel), 'félin{Enter}');
    await user.click(await screen.findByRole('button', { name: ACCEPT }));

    await vi.waitFor(() => {
      expect(store.revisions).toHaveLength(1);
    });
    expect(store.answers).toHaveLength(1);
    expect(store.revisions[0]?.result).toMatchObject({ outcome: 'correct', rating: 'good' });
    expect(store.revisions[0]?.state.lapses).toBe(0);
  });

  it('never plays the word before it is typed, then reads it as an echo', async () => {
    const { user, speaker } = setup({ cards: [cat], answerMode: 'typeWord' });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    const field = await screen.findByLabelText(fr.typed.answerLabel);
    expect(speaker.speak).not.toHaveBeenCalled();

    await user.type(field, '狗{Enter}');

    expect(await screen.findByText(/Faux/)).toBeVisible();
    expect(speaker.speak).toHaveBeenCalledWith('猫', 'zh');
    expect(screen.queryByRole('button', { name: ACCEPT })).toBeNull();
  });

  it('turns off the self-evaluation keys: Space, 1, 2 and 3 rate nothing', async () => {
    const { user, store } = setup({ cards: [cat], answerMode: 'typeMeaning' });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    const field = await screen.findByLabelText(fr.typed.answerLabel);

    await user.type(field, ' 123');
    field.blur();
    await user.keyboard(' 3');

    expect(field).toHaveValue(' 123');
    expect(store.answers).toEqual([]);
  });

  it('alternates typing the meaning and typing the word when mixed', async () => {
    const { user } = setup({ answerMode: 'mixed' });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    const prompts: string[] = [];

    for (let index = 0; index < 2; index += 1) {
      await screen.findByLabelText(fr.typed.answerLabel);
      prompts.push(
        screen.queryByText(fr.typed.prompt.typeMeaning) === null ? 'typeWord' : 'typeMeaning',
      );
      await user.click(screen.getByRole('button', { name: fr.dictation.dontKnow }));
      await user.click(await screen.findByRole('button', { name: fr.dictation.continue }));
    }

    expect(new Set(prompts)).toEqual(new Set(['typeMeaning', 'typeWord']));
  });

  it('accepts a wrong meaning in free practice without touching any review', async () => {
    const { user, store } = setup({ cards: [cat], answerMode: 'typeMeaning' });
    await user.click(screen.getByRole('button', { name: fr.practice.start }));

    await user.type(await screen.findByLabelText(fr.typed.answerLabel), 'félin{Enter}');
    await user.click(await screen.findByRole('button', { name: ACCEPT }));
    await user.click(screen.getByRole('button', { name: fr.dictation.continue }));

    expect(await screen.findByText(fr.practice.summaryTitle)).toBeVisible();
    expect(store.practiceRevisions).toHaveLength(1);
    expect(store.answers).toEqual([]);
    expect(screen.getByText(fr.practice.known.replace('{count}', '1'))).toBeVisible();
  });
});
