import type { Stage } from './reviewState';

export interface FsrsSettings {
  readonly requestRetention: number;
  readonly enableShortTerm: boolean;
  readonly enableFuzz: boolean;
  readonly maximumIntervalDays: number;
}

export interface StageThreshold {
  readonly stage: Stage;
  readonly minStabilityDays: number;
  readonly minSuccessDays: number;
}

export interface SrsConfig {
  /** Local hour at which a new day starts. */
  readonly dayStartHour: number;
  readonly fsrs: FsrsSettings;
  /** Beyond this response time, a correct choice is rated `hard`. */
  readonly choiceSlowMs: number;
  /** Ordered from the highest stage down: the first one satisfied wins. */
  readonly stageThresholds: readonly StageThreshold[];
  /** Below this recall probability, a due word is very thirsty. */
  readonly strongThirstRetrievability: number;
}

/**
 * Spaced repetition part of GAME_CONFIG (GAME_DESIGN.md section 11). Inject it into domain
 * functions rather than importing it in business code, so that tests can try other values.
 */
export const GAME_CONFIG: SrsConfig = Object.freeze({
  dayStartHour: 4,
  fsrs: Object.freeze({
    requestRetention: 0.9,
    enableShortTerm: false,
    enableFuzz: true,
    maximumIntervalDays: 36500,
  }),
  choiceSlowMs: 8000,
  stageThresholds: Object.freeze([
    Object.freeze({ stage: 'lantern', minStabilityDays: 60, minSuccessDays: 5 }),
    Object.freeze({ stage: 'flower', minStabilityDays: 21, minSuccessDays: 4 }),
    Object.freeze({ stage: 'bud', minStabilityDays: 7, minSuccessDays: 3 }),
    Object.freeze({ stage: 'stem', minStabilityDays: 3, minSuccessDays: 2 }),
  ]),
  strongThirstRetrievability: 0.7,
});
