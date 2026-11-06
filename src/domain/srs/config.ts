export interface FsrsSettings {
  readonly requestRetention: number;
  readonly enableShortTerm: boolean;
  readonly enableFuzz: boolean;
  readonly maximumIntervalDays: number;
}

export interface SrsConfig {
  readonly fsrs: FsrsSettings;
  /** Beyond this response time, a correct choice is rated `hard`. */
  readonly choiceSlowMs: number;
}

/**
 * Spaced repetition part of GAME_CONFIG (GAME_DESIGN.md section 11). Inject it into domain
 * functions rather than importing it in business code, so that tests can try other values.
 */
export const GAME_CONFIG: SrsConfig = Object.freeze({
  fsrs: Object.freeze({
    requestRetention: 0.9,
    enableShortTerm: false,
    enableFuzz: true,
    maximumIntervalDays: 36500,
  }),
  choiceSlowMs: 8000,
});
