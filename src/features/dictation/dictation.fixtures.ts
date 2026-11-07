import { vi } from 'vitest';
import type { Card, Language } from '../../domain/card';
import type { SessionRecord } from '../../domain/progressRecords';
import { GAME_CONFIG } from '../../domain/srs/config';
import { createFsrsMemoryModel } from '../../domain/srs/fsrsMemoryModel';
import type { ReviewState } from '../../domain/srs/reviewState';
import type { AnswerRecord, StudyData } from '../../storage/studyRepository';
import { SpeechBlockedError, type SpeakOptions, type Speaker } from '../../services/tts/speaker';
import type { DictationStore } from './dictationSession';

/** Test helpers shared by the dictation tests. */

export interface Reading {
  text: string;
  language: Language;
  rate: number | undefined;
  /** Ends the utterance, as the browser's `onend` would. */
  end: () => void;
  fail: () => void;
  /** Refuses the reading, as Chrome Android does without a user gesture (not-allowed). */
  block: () => void;
}

/** A speaker whose readings end only when the test says so. */
export class FakeSpeaker implements Speaker {
  readonly readings: Reading[] = [];

  /** `autoEnd`: every reading ends at once, for screen tests. */
  constructor(
    public voice = true,
    private readonly autoEnd = false,
  ) {}

  readonly cancel = vi.fn(() => {
    // A cancelled reading resolves quietly, like an interrupted utterance.
    for (const reading of this.readings) {
      reading.end();
    }
  });

  /** Called in the click that starts audio, to let a phone speak. */
  readonly unlock = vi.fn();

  /** The speed chosen in the settings. */
  readonly setRate = vi.fn();

  hasVoice(): Promise<boolean> {
    return Promise.resolve(this.voice);
  }

  speak(text: string, language: Language, options: SpeakOptions = {}): Promise<void> {
    if (!this.voice) {
      this.readings.push({
        text,
        language,
        rate: options.rate,
        end: () => undefined,
        fail: () => undefined,
        block: () => undefined,
      });
      return Promise.reject(new Error(`No voice for ${language}`));
    }
    return new Promise((resolve, reject) => {
      if (this.autoEnd) {
        resolve();
      }
      this.readings.push({
        text,
        language,
        rate: options.rate,
        end: resolve,
        fail: () => {
          reject(new Error('Speech failed'));
        },
        block: () => {
          reject(new SpeechBlockedError());
        },
      });
    });
  }

  get texts(): string[] {
    return this.readings.map(({ text }) => text);
  }

  last(): Reading {
    const reading = this.readings.at(-1);
    if (reading === undefined) {
      throw new Error('Nothing was read');
    }
    return reading;
  }
}

export const srs = {
  model: createFsrsMemoryModel({ ...GAME_CONFIG.fsrs, enableFuzz: false }),
  config: GAME_CONFIG,
  timeZone: 'Europe/Paris',
};

export function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    language: 'zh',
    term: id,
    translation: `meaning of ${id}`,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
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
export class FakeStore implements DictationStore {
  sessions: SessionRecord[] = [];
  answers: AnswerRecord[] = [];

  constructor(private readonly data: Partial<StudyData> = {}) {}

  load(): Promise<StudyData> {
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

  endSession(sessionId: string, endedAt: string): Promise<void> {
    const session = this.sessions.find(({ id }) => id === sessionId);
    if (session !== undefined) {
      session.endedAt = endedAt;
    }
    return Promise.resolve();
  }
}
