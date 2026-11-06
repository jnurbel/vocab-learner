/**
 * Spaced repetition part of GAME_CONFIG (GAME_DESIGN.md section 11). Inject it into domain
 * functions rather than importing it in business code, so that tests can try other values.
 */
export const GAME_CONFIG = Object.freeze({
  fsrs: Object.freeze({
    requestRetention: 0.9,
    enableShortTerm: false,
    enableFuzz: true,
    maximumIntervalDays: 36500,
  }),
});

export type FsrsSettings = typeof GAME_CONFIG.fsrs;
