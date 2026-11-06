import { webcrypto } from 'node:crypto';
import type { Card, Language } from '../card';
import type { Label } from '../label';
import type { ReviewStateRecord } from '../progressRecords';
import type { BackupData, BackupMetadata } from './backupDocument';
import { sha256With } from './sha256';

/** Test helpers shared by the backup tests. */

export const sha256 = sha256With(webcrypto.subtle);

export const now = '2026-11-05T12:00:00.000Z';

export const metadata: BackupMetadata = {
  exportedAt: now,
  appVersion: '0.3.0',
  profileName: 'Léa',
};

export function card(
  id: string,
  term: string,
  labelIds: string[] = [],
  language: Language = 'zh',
): Card {
  return {
    id,
    language,
    term,
    translation: `meaning of ${term}`,
    labelIds,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

export function label(id: string, name: string): Label {
  return { id, name, isFocus: false, createdAt: now, updatedAt: now };
}

export function reviewState(
  cardId: string,
  overrides: Partial<ReviewStateRecord> = {},
): ReviewStateRecord {
  return {
    cardId,
    due: now,
    stability: 2.5,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    state: 'review',
    successDays: 2,
    peakStage: 'sprout',
    ...overrides,
  };
}

export function emptyData(): BackupData {
  return {
    cards: [],
    labels: [],
    ignoredTerms: [],
    reviewStates: [],
    sessions: [],
    pathProgress: [],
  };
}

/** A small but complete profile: every collection and singleton is filled. */
export function sampleData(): BackupData {
  return {
    cards: [card('c1', '猫', ['animals']), card('c2', 'apple', [], 'en')],
    labels: [label('animals', 'Animaux')],
    ignoredTerms: [{ language: 'en', term: 'the' }],
    reviewStates: [reviewState('c1', { lastReviewAt: now, lastSuccessDay: '2026-11-05' })],
    sessions: [
      {
        id: 's1',
        language: 'zh',
        startedAt: now,
        endedAt: now,
        labelIds: ['animals'],
        mode: 'garden',
        results: [
          {
            cardId: 'c1',
            outcome: 'correct',
            exercise: 'listenMeaning',
            rating: 'good',
            hintsUsed: 0,
            responseMs: 1200,
            at: now,
          },
        ],
      },
    ],
    progress: {
      xp: 120,
      level: 2,
      streakDays: 3,
      bestStreak: 5,
      unlocks: ['pond'],
      lastActiveDate: '2026-11-05',
    },
    settings: {
      ttsRate: 1,
      dailyGoalXp: 300,
      sfxEnabled: true,
      intensiveExamMode: { animals: true },
    },
    pathProgress: [
      {
        labelId: 'animals',
        language: 'zh',
        steps: { discover: 'validated', listen: 'current' },
        stepAttempts: { listen: { c1: true } },
      },
    ],
  };
}
