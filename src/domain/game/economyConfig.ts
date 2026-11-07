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

/**
 * Economy part of GAME_CONFIG (GAME_DESIGN.md section 11). Inject it into domain functions
 * rather than importing it in business code, so that tests can try other values.
 */
export interface EconomyConfig {
  readonly xp: XpTable;
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
});
