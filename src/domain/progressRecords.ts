import type { Language } from './card';

/**
 * Stored shapes of the learning progress (DESIGN §3, GAME_DESIGN §0.6), as they are kept in the
 * database and in a backup. The FSRS logic owns their meaning; this module only describes them.
 * Fields that the app does not use yet are optional.
 */

export type Stage = 'seed' | 'sprout' | 'stem' | 'bud' | 'flower' | 'lantern';

export interface ReviewStateRecord {
  cardId: string;
  /** ISO datetime. */
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: 'new' | 'review' | 'relearning';
  lastReviewAt?: string;
  successDays: number;
  /** 'YYYY-MM-DD'. */
  lastSuccessDay?: string;
  lastRatedDay?: string;
  peakStage: Stage;
}

export type ExerciseType =
  | 'discovery'
  | 'audioFlashcard'
  | 'listenMeaning'
  | 'listenType'
  | 'toneEcho'
  | 'bridgeMatch'
  | 'sentenceListen'
  | 'sentenceShuffle'
  | 'typeEcho'
  | 'seasonRush';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

/** Outcomes of DESIGN §3 and of GAME_DESIGN §0.6 together. */
export type SessionOutcome = Rating | 'correct' | 'correctWithHint' | 'almost' | 'wrong';

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
