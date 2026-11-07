import type { Card } from '../../domain/card';
import type { SessionRecord } from '../../domain/progressRecords';
import { GAME_CONFIG } from '../../domain/srs/config';
import { createFsrsMemoryModel } from '../../domain/srs/fsrsMemoryModel';
import type { ReviewState } from '../../domain/srs/reviewState';
import type { AnswerRecord, PracticeAnswerRecord, StudyData } from '../../storage/studyRepository';
import type { PracticeStore } from '../practice/practiceSession';
import type { FlashcardStore } from './flashcardSession';

/** Test helpers shared by the flashcard tests. */

export const srs = {
  model: createFsrsMemoryModel({ ...GAME_CONFIG.fsrs, enableFuzz: false }),
  config: GAME_CONFIG,
  timeZone: 'Europe/Paris',
};

export function card(
  id: string,
  createdAt = '2026-10-01T00:00:00.000Z',
  overrides: Partial<Card> = {},
): Card {
  return {
    id,
    language: 'zh',
    term: id,
    translation: `meaning of ${id}`,
    labelIds: [],
    source: 'manual',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function reviewed(cardId: string, overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    cardId,
    due: '2026-11-05T08:00:00.000Z',
    stability: 4,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    state: 'review',
    lastReviewAt: '2026-11-01T08:00:00.000Z',
    successDays: 2,
    lastSuccessDay: '2026-11-01',
    lastRatedDay: '2026-11-01',
    peakStage: 'stem',
    ...overrides,
  };
}

/** In-memory store that behaves like StudyRepository. */
export class FakeStore implements FlashcardStore, PracticeStore {
  sessions: SessionRecord[] = [];
  answers: AnswerRecord[] = [];
  practiceAnswers: PracticeAnswerRecord[] = [];
  /** Answers corrected by "J'avais bon", which replace a stored one. */
  revisions: AnswerRecord[] = [];
  practiceRevisions: PracticeAnswerRecord[] = [];
  loadedSince: string | undefined;

  constructor(private readonly data: Partial<StudyData> = {}) {}

  load(since: string): Promise<StudyData> {
    this.loadedSince = since;
    return Promise.resolve({ reviewStates: [], recentSessions: [], ...this.data });
  }

  startSession(session: SessionRecord): Promise<void> {
    this.sessions.push(session);
    return Promise.resolve();
  }

  recordAnswer(answer: AnswerRecord): Promise<void> {
    this.answers.push(answer);
    return Promise.resolve();
  }

  reviseAnswer(answer: AnswerRecord): Promise<void> {
    this.revisions.push(answer);
    return Promise.resolve();
  }

  revisePracticeAnswer(answer: PracticeAnswerRecord): Promise<void> {
    this.practiceRevisions.push(answer);
    return Promise.resolve();
  }

  recordPracticeAnswer(answer: PracticeAnswerRecord): Promise<void> {
    this.practiceAnswers.push(answer);
    return Promise.resolve();
  }

  endSession(sessionId: string, endedAt: string): Promise<void> {
    const session = this.sessions.find(({ id }) => id === sessionId);
    if (session !== undefined) {
      session.endedAt = endedAt;
    }
    return Promise.resolve();
  }
}
