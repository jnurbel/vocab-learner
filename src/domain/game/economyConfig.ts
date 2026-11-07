/** Experience points of each rewarded action (GAME_DESIGN.md 4.1). */
export interface XpTable {
  readonly correct: number;
  readonly correctWithHint: number;
  readonly almost: number;
  readonly wrong: number;
  readonly cardIntroduced: number;
  readonly sessionCompleted: number;
  readonly messengerCompleted: number;
  readonly stageReached: number;
  readonly pathStepValidated: number;
  readonly finalChallengePassed: number;
}

/** From this many times the daily goal on, the gains are multiplied by `factor`. */
export interface DiminishingTier {
  readonly fromGoalMultiple: number;
  readonly factor: number;
}

/**
 * Economy part of GAME_CONFIG (GAME_DESIGN.md section 11). Inject it into domain functions
 * rather than importing it in business code, so that tests can try other values.
 */
export interface EconomyConfig {
  readonly xp: XpTable;
  /** A word earns its normal points for this many answers a day, then `repeatedAnswerXp`. */
  readonly maxRewardedAnswersPerCardPerDay: number;
  readonly repeatedAnswerXp: number;
  readonly dailyGoalXpDefault: number;
  readonly dailyGoalXpOptions: readonly number[];
  /** Ordered by growing goal multiple: the last one reached applies. */
  readonly diminishingTiers: readonly DiminishingTier[];
  /** Going from level n to n + 1 takes levelBaseXp + levelStepXp * (n - 1) points. */
  readonly levelBaseXp: number;
  readonly levelStepXp: number;
  /** A day is active with this many answers, or a finished session. */
  readonly activeDayMinAnswers: number;
  /** Missed days covered per ISO week without breaking the streak. */
  readonly brumeDaysPerWeek: number;
  /** Brume days older than this are forgotten. */
  readonly brumeRetentionDays: number;
}

export const ECONOMY_CONFIG: EconomyConfig = Object.freeze({
  xp: Object.freeze({
    correct: 10,
    correctWithHint: 5,
    almost: 5,
    wrong: 2,
    cardIntroduced: 5,
    sessionCompleted: 30,
    messengerCompleted: 10,
    stageReached: 15,
    pathStepValidated: 50,
    finalChallengePassed: 100,
  }),
  maxRewardedAnswersPerCardPerDay: 3,
  repeatedAnswerXp: 1,
  dailyGoalXpDefault: 300,
  dailyGoalXpOptions: Object.freeze([150, 300, 450]),
  diminishingTiers: Object.freeze([
    Object.freeze({ fromGoalMultiple: 1, factor: 0.5 }),
    Object.freeze({ fromGoalMultiple: 2, factor: 0.25 }),
  ]),
  levelBaseXp: 100,
  levelStepXp: 50,
  activeDayMinAnswers: 10,
  brumeDaysPerWeek: 2,
  brumeRetentionDays: 14,
});
