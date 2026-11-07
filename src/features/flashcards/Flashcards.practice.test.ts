import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import fr from '../../i18n/fr.json';
import type { Speaker } from '../../services/tts/speaker';
import type { StudyData } from '../../storage/studyRepository';
import { startPracticeSession } from '../practice/practiceSession';
import { card, FakeStore, reviewed, srs } from './flashcards.fixtures';
import Flashcards from './Flashcards.svelte';
import {
  loadStudyOutlook,
  startFlashcardSession,
  type FlashcardSelection,
} from './flashcardSession';

const morning = new Date('2026-11-06T08:00:00Z');

const speaker: Speaker = {
  hasVoice: () => Promise.resolve(true),
  speak: () => Promise.resolve(),
  cancel: () => undefined,
};

const cat = card('cat', '2026-10-01T00:00:00.000Z', { term: '猫', translation: 'chat' });
const dog = card('dog', '2026-10-02T00:00:00.000Z', { term: '狗', translation: 'chien' });

function setup({
  cards = [cat, dog],
  data = {},
}: { cards?: Card[]; data?: Partial<StudyData> } = {}) {
  const store = new FakeStore(data);
  let sessionCount = 0;
  const newId = () => `s${String((sessionCount += 1))}`;
  const startSession = vi.fn((selection: FlashcardSelection) =>
    startFlashcardSession(selection, { store, srs, clock: () => morning, newId }),
  );
  const startPractice = vi.fn((selection: FlashcardSelection) =>
    startPracticeSession(selection, { store, clock: () => morning, newId }),
  );
  const loadOutlook = vi.fn((selection: FlashcardSelection) =>
    loadStudyOutlook(selection, { store, srs, clock: () => morning }),
  );
  const onSessionEnd = vi.fn();
  render(Flashcards, {
    cards,
    labels: [],
    startSession,
    startPractice,
    loadOutlook,
    loadPinyin: () => Promise.reject(new Error('Only a typed word needs the pinyin')),
    speaker,
    onSessionEnd,
  });
  return { store, startPractice, loadOutlook, onSessionEnd, user: userEvent.setup() };
}

const region = () => screen.getByRole('region', { name: fr.flashcards.title });

describe('Flashcards free practice', () => {
  it('starts from the first screen on every word, with a banner saying nothing is planned', async () => {
    const { user, startPractice } = setup();

    await user.click(screen.getByRole('button', { name: fr.practice.start }));

    expect(startPractice).toHaveBeenCalledWith(expect.objectContaining({ language: 'zh' }));
    expect(await screen.findByText(fr.practice.banner)).toBeVisible();
    expect(within(region()).getByText('1 / 2')).toBeVisible();
  });

  it('changes no review, sums up the practice and starts again with the words to review', async () => {
    const { user, store, startPractice, onSessionEnd } = setup({
      data: { reviewStates: [reviewed('cat'), reviewed('dog')] },
    });
    await user.click(screen.getByRole('button', { name: fr.practice.start }));
    await screen.findByText('1 / 2');

    await user.click(screen.getByRole('button', { name: fr.flashcards.flip }));
    expect(screen.queryByRole('button', { name: fr.flashcards.evaluations.known })).toBeNull();
    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.again }));
    await screen.findByText('2 / 2');
    await user.click(screen.getByRole('button', { name: fr.flashcards.flip }));
    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));

    expect(await screen.findByRole('heading', { name: fr.practice.summaryTitle })).toBeVisible();
    expect(store.answers).toEqual([]);
    expect(store.practiceAnswers).toHaveLength(2);
    expect(screen.getByText('2 mots vus')).toBeVisible();
    expect(screen.getByText('Je savais : 1')).toBeVisible();
    expect(screen.getByText('À revoir : 1')).toBeVisible();
    expect(onSessionEnd).toHaveBeenCalledOnce();

    const firstCardId = store.practiceAnswers[0]?.result.cardId;
    await user.click(screen.getByRole('button', { name: fr.practice.retry }));

    expect(startPractice).toHaveBeenLastCalledWith(
      expect.objectContaining({ cards: [expect.objectContaining({ id: firstCardId })] }),
    );
    expect(await screen.findByText('1 / 1')).toBeVisible();
    expect(screen.getByText(fr.practice.banner)).toBeVisible();
  });

  it('makes free practice the main way forward when nothing is thirsty today', async () => {
    const ratedToday = { lastRatedDay: '2026-11-06', due: '2026-11-08T08:00:00.000Z' };
    const { user } = setup({
      data: { reviewStates: [reviewed('cat', ratedToday), reviewed('dog', ratedToday)] },
    });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    expect(await screen.findByText(fr.flashcards.nothingDue)).toBeVisible();

    const practice = screen.getByRole('button', { name: fr.practice.start });
    expect(practice).toHaveClass('primary');
    await user.click(practice);

    expect(await screen.findByText(fr.practice.banner)).toBeVisible();
    expect(within(region()).getByText('1 / 2')).toBeVisible();
  });

  it('offers free practice at the end of a session', async () => {
    const { user } = setup({ cards: [cat] });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));
    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));
    await screen.findByRole('heading', { name: fr.flashcards.summaryTitle });

    await user.click(screen.getByRole('button', { name: fr.practice.start }));

    expect(await screen.findByText(fr.practice.banner)).toBeVisible();
  });
});

describe('Flashcards study outlook', () => {
  it('explains the queue of the chosen language on the first screen', async () => {
    const { user, loadOutlook } = setup({
      cards: [cat, dog, card('apple', undefined, { language: 'en' })],
    });

    expect(await screen.findByText("Aujourd'hui : 0 à revoir, 2 nouveaux")).toBeVisible();

    await user.click(screen.getByRole('radio', { name: fr.languages.en }));

    expect(await screen.findByText("Aujourd'hui : 0 à revoir, 1 nouveau")).toBeVisible();
    expect(loadOutlook).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en' }));
  });

  it('tells when the next reviews come once nothing is thirsty', async () => {
    const ratedToday = { lastRatedDay: '2026-11-06', due: '2026-11-07T08:00:00.000Z' };
    const { user } = setup({
      data: { reviewStates: [reviewed('cat', ratedToday), reviewed('dog', ratedToday)] },
    });
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    expect(await screen.findByText(fr.flashcards.nothingDue)).toBeVisible();
    expect(await screen.findByText('Prochaine révision : demain, 2 mots')).toBeVisible();
  });
});
