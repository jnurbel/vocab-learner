import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import fr from '../../i18n/fr.json';
import type { Speaker } from '../../services/tts/speaker';
import { startPracticeSession } from '../practice/practiceSession';
import { card, FakeStore, srs } from './flashcards.fixtures';
import Flashcards from './Flashcards.svelte';
import {
  loadStudyOutlook,
  startFlashcardSession,
  type FlashcardSelection,
  type StudyOutlookView,
} from './flashcardSession';

const morning = new Date('2026-11-06T08:00:00Z');
const cat = card('cat', undefined, { term: '猫', translation: 'chat' });

const speaker: Speaker = {
  hasVoice: () => Promise.resolve(true),
  speak: () => Promise.resolve(),
  cancel: () => undefined,
  unlock: () => undefined,
  setRate: () => undefined,
};

function setup(cards: Card[], outlook?: (selection: FlashcardSelection) => StudyOutlookView) {
  const store = new FakeStore();
  const startSession = vi.fn((selection: FlashcardSelection) =>
    startFlashcardSession(selection, { store, srs, clock: () => morning, newId: () => 's1' }),
  );
  render(Flashcards, {
    cards,
    labels: [],
    startSession,
    startPractice: (selection: FlashcardSelection) =>
      startPracticeSession(selection, {
        store,
        clock: () => morning,
        newId: () => 'p1',
        dayOf: () => '2026-11-06',
      }),
    loadOutlook: (selection: FlashcardSelection) =>
      outlook === undefined
        ? loadStudyOutlook(selection, { store, srs, clock: () => morning })
        : Promise.resolve(outlook(selection)),
    loadPinyin: () => Promise.reject(new Error('Not needed')),
    speaker,
    onSessionEnd: vi.fn(),
  });
  return { store, startSession, user: userEvent.setup() };
}

async function answerKnown(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Retourner/ }));
  await user.click(screen.getByRole('button', { name: /Je savais/ }));
}

describe('the summary of a flashcard session', () => {
  it('shows the points earned, the daily goal, the streak and the level', async () => {
    const { user } = setup([cat]);
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    await answerKnown(user);

    expect(await screen.findByText(fr.flashcards.summaryTitle)).toBeVisible();
    // Discovered (5) + right (10) + session completed (30).
    expect(screen.getByText('+45 XP')).toBeVisible();
    expect(screen.getByText('Objectif du jour : 45 / 300 XP')).toBeVisible();
    expect(screen.getByText('Série : 1 jour (record : 1)')).toBeVisible();
    expect(screen.getByText('Île niveau 1')).toBeVisible();
  });

  it('keeps what the summary already showed', async () => {
    const { user } = setup([cat]);
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));

    await answerKnown(user);

    expect(await screen.findByText('1 mot(s) nouveau(x)')).toBeVisible();
  });

  it('offers a bonus session when words are still thirsty, and starts it', async () => {
    const thirsty: StudyOutlookView = {
      today: '2026-11-06',
      newPerDay: 5,
      dueToday: 3,
      reviewedToday: 1,
      dueTomorrow: 0,
      newAvailableToday: 1,
      newWaiting: 0,
    };
    const { user, startSession } = setup([cat], () => thirsty);
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await answerKnown(user);

    await user.click(await screen.findByRole('button', { name: /Encore 3 mots ont soif/ }));

    expect(startSession).toHaveBeenCalledTimes(2);
  });

  it('shows the points of a free practice, which never makes a streak', async () => {
    const { user } = setup([cat]);
    await user.click(screen.getByRole('button', { name: fr.practice.start }));

    await answerKnown(user);

    expect(await screen.findByText('+10 XP')).toBeVisible();
    expect(screen.getByText('Série : 0 jour (record : 0)')).toBeVisible();
  });
});
