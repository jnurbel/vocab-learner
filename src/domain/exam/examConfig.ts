/**
 * Exam planning part of GAME_CONFIG (GAME_DESIGN.md sections 2 and 11). Kept apart from the
 * spaced repetition constants of srs/config.ts; inject it rather than importing it in business
 * code, so that tests can try other values.
 */
export interface ExamConfig {
  /** Daily cap of new words, and the cap in intensive mode (chosen per label). */
  readonly maxNewPerDay: number;
  readonly intensiveMaxNewPerDay: number;
  /** New words in a single session; the rest of the daily quota waits for a bonus session. */
  readonly maxNewPerSession: number;
  /** Every word of the label is reviewed at least once in the last days before the test. */
  readonly examWindowDays: number;
  /** Review-only days kept before the test, when at least `examReserveMinDaysLeft` are left. */
  readonly examReserveDays: number;
  readonly examReserveMinDaysLeft: number;
  /** Daily minutes above which the plan is tight, then overloaded. */
  readonly examTightMinutes: number;
  readonly examOverloadMinutes: number;
  /** Days after the test before the label is unpinned. */
  readonly autoUnfocusDelayDays: number;
  /** The forecast answers wrong every n-th answer (about 86 % success). */
  readonly forecastFailEvery: number;
  /** Bound on a test date typed by the learner, which also bounds the forecast. */
  readonly maxExamDaysAhead: number;
  /** Estimated seconds per item, feedback included. */
  readonly itemCostSec: Readonly<{
    discovery: number;
    listenMeaning: number;
    audioFlashcard: number;
  }>;
}

export const EXAM_CONFIG: ExamConfig = Object.freeze({
  maxNewPerDay: 20,
  intensiveMaxNewPerDay: 30,
  maxNewPerSession: 12,
  examWindowDays: 2,
  examReserveDays: 1,
  examReserveMinDaysLeft: 3,
  examTightMinutes: 15,
  examOverloadMinutes: 25,
  autoUnfocusDelayDays: 1,
  forecastFailEvery: 7,
  maxExamDaysAhead: 365,
  itemCostSec: Object.freeze({ discovery: 25, listenMeaning: 7, audioFlashcard: 8 }),
});
