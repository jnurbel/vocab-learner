import type { Language } from './card';
import type { Outcome, Rating } from './srs/reviewState';

/**
 * Stored shapes of the learning progress (DESIGN §3, GAME_DESIGN §0.6), as they are kept in the
 * database and in a backup. The FSRS logic owns their meaning; this module only describes them.
 * Fields that the app does not use yet are optional.
 */

/** The spaced repetition owns the review state: storage and backups keep it as it is. */
export type { Rating, ReviewState as ReviewStateRecord, Stage } from './srs/reviewState';

/** Every kind of exercise a session result can come from. */
export const EXERCISE_TYPES = [
  'discovery',
  'audioFlashcard',
  'listenMeaning',
  'listenType',
  'toneEcho',
  'bridgeMatch',
  'sentenceListen',
  'sentenceShuffle',
  'typeEcho',
  /** The flashcard shows the word, the learner types its French meaning. */
  'typeMeaning',
  'seasonRush',
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Outcomes of DESIGN §3 and of GAME_DESIGN §0.6 together. */
export type SessionOutcome = Rating | Outcome;

export interface SessionResultRecord {
  cardId: string;
  outcome: SessionOutcome;
  exercise?: ExerciseType;
  rating?: Rating;
  hintsUsed?: number;
  responseMs?: number;
  answer?: string;
  at?: string;
}

export interface SessionRecord {
  id: string;
  language: Language;
  startedAt: string;
  results: SessionResultRecord[];
  labelIds?: string[];
  mode?: string;
  endedAt?: string;
}

export interface GameLevel {
  level: 1 | 2 | 3;
  window: boolean[];
}

export interface ProgressRecord {
  xp?: number;
  level?: number;
  streakDays?: number;
  bestStreak?: number;
  unlocks?: string[];
  lastActiveDate?: string;
  dailyXp?: number;
  dailyXpDay?: string;
  brumeDays?: string[];
  gameLevels?: Record<string, GameLevel>;
  rushRecords?: Record<string, number>;
  stamps?: number;
  dailyRewardedCount?: Record<string, number>;
}

export interface SettingsRecord {
  voiceZh?: string;
  voiceEn?: string;
  ttsRate?: number;
  dictationDelayMs?: number;
  dailyGoalXp?: number;
  photoCheckEnabled?: boolean;
  speedGameEnabled?: boolean;
  newPerDay?: number;
  sfxEnabled?: boolean;
  sfxVolume?: number;
  audioFreeMode?: boolean;
  rushTimeMultiplier?: 1 | 1.5 | 2;
  intensiveExamMode?: Record<string, boolean>;
}

export type PathStep =
  'discover' | 'listen' | 'recognize' | 'type' | 'dictation' | 'sentences' | 'finalChallenge';

export type PathStepStatus = 'locked' | 'current' | 'validated' | 'skipped';

export interface PathProgressRecord {
  labelId: string;
  language: Language;
  steps?: Partial<Record<PathStep, PathStepStatus>>;
  /** Last result per card per step. */
  stepAttempts?: Partial<Record<PathStep, Record<string, boolean>>>;
  /** Best score out of 20. */
  finalChallengeBest?: number;
}

/** "I already know it": never proposed again by the text import. */
export interface IgnoredTerm {
  language: Language;
  term: string;
}
