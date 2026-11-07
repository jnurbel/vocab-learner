import type { SettingsRecord } from './progressRecords';

/** New words introduced per day unless the learner chose otherwise (GAME_DESIGN.md 0.6). */
export const DEFAULT_NEW_PER_DAY = 5;

/** Bounds of a valid daily quota of new words. */
export const NEW_PER_DAY_RANGE = { min: 1, max: 50 } as const;

/** The quotas offered in the settings. */
export const NEW_PER_DAY_CHOICES: readonly number[] = Object.freeze([3, 5, 8, 10, 15, 20, 30]);

export function isValidNewPerDay(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= NEW_PER_DAY_RANGE.min &&
    (value as number) <= NEW_PER_DAY_RANGE.max
  );
}

/** The learner's daily quota of new words; a stored value that is not valid gives the default. */
export function newPerDayOf(settings: SettingsRecord | undefined): number {
  const chosen = settings?.newPerDay;
  return isValidNewPerDay(chosen) ? chosen : DEFAULT_NEW_PER_DAY;
}

/**
 * How the learner answers a flashcard: rating themselves (the default), typing the French
 * meaning of the word shown, typing the word of the meaning shown, or both in turn.
 */
export const ANSWER_MODES = ['selfAssess', 'typeMeaning', 'typeWord', 'mixed'] as const;

export type AnswerMode = (typeof ANSWER_MODES)[number];

export const DEFAULT_ANSWER_MODE: AnswerMode = 'selfAssess';

export function isAnswerMode(value: unknown): value is AnswerMode {
  return ANSWER_MODES.some((mode) => mode === value);
}

/** The learner's way of answering; a stored value that is not valid gives the default. */
export function answerModeOf(settings: SettingsRecord | undefined): AnswerMode {
  const chosen = settings?.answerMode;
  return isAnswerMode(chosen) ? chosen : DEFAULT_ANSWER_MODE;
}
