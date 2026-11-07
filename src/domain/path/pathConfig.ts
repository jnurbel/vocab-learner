/**
 * Path part of GAME_CONFIG (GAME_DESIGN.md sections 5 and 11). Inject it into domain functions
 * rather than importing it in business code, so that tests can try other values.
 */
export interface PathConfig {
  /** A step is validated when this share of the words meets its criterion. */
  readonly stepPassRatio: number;
  /** Items of a placement test, and the share of right answers that validates the step. */
  readonly placementTestSize: number;
  readonly placementPassRatio: number;
  /** Target length of a step session, which sizes it with itemCostSec. */
  readonly stepSessionTargetSec: number;
  /** Below this many words with an example, the sentences step is skipped. */
  readonly minExamplesForSentenceStep: number;
  /** toneEcho counts on its last items in the label, when enough words can be asked in it. */
  readonly toneEchoWindow: number;
  readonly toneEchoMinEligibleWords: number;
  readonly finalChallengeMaxWords: number;
  /** Shares of the three sections of the final challenge, in the order they are asked. */
  readonly finalChallengeMix: Readonly<{
    listening: number;
    dictation: number;
    translation: number;
  }>;
  readonly finalChallengeReplaysPerWord: number;
  readonly finalChallengePassScore20: number;
  /** Estimated seconds per item, feedback included. */
  readonly itemCostSec: Readonly<{
    discovery: number;
    listenMeaning: number;
    typeEcho: number;
    listenType: number;
    bridgeMatchPair: number;
    sentenceListen: number;
  }>;
}

export const PATH_CONFIG: PathConfig = Object.freeze({
  stepPassRatio: 0.8,
  placementTestSize: 10,
  placementPassRatio: 0.9,
  stepSessionTargetSec: 240,
  minExamplesForSentenceStep: 3,
  toneEchoWindow: 20,
  toneEchoMinEligibleWords: 5,
  finalChallengeMaxWords: 30,
  finalChallengeMix: Object.freeze({ listening: 0.3, dictation: 0.4, translation: 0.3 }),
  finalChallengeReplaysPerWord: 1,
  finalChallengePassScore20: 16,
  itemCostSec: Object.freeze({
    discovery: 25,
    listenMeaning: 7,
    typeEcho: 14,
    listenType: 12,
    bridgeMatchPair: 6,
    sentenceListen: 15,
  }),
});
