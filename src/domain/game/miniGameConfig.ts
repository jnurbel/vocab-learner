import type { Language } from '../card';

export type Difficulty = 1 | 2 | 3;

export interface AdaptiveSettings {
  readonly initialLevel: Difficulty;
  readonly windowSize: number;
  readonly upMinCorrect: number;
  readonly downMaxCorrect: number;
  readonly sproutMaxLevel: Difficulty;
}

/** Points of sound proximity between two words (GAME_DESIGN.md 6.0, distractors). */
export interface SimilarityWeights {
  readonly zh: {
    readonly sameLength: number;
    readonly sharedChar: number;
    readonly sharedCharMax: number;
    readonly sameSyllableToneless: number;
    readonly sameTonePattern: number;
    readonly sameInitialOrFinal: number;
    readonly sharedLabel: number;
  };
  readonly en: {
    readonly lengthWithin1: number;
    readonly levenshteinLe2: number;
    readonly levenshteinEq3: number;
    readonly samePrefix2: number;
    readonly sameSuffix3: number;
    readonly minimalPair: number;
    readonly sharedLabel: number;
  };
}

/**
 * Mini-game part of GAME_CONFIG (GAME_DESIGN.md section 11). Inject it into domain functions
 * rather than importing it in business code, so that tests can try other values.
 */
export interface MiniGameConfig {
  readonly adaptive: AdaptiveSettings;
  readonly optionsByLevel: Readonly<Record<Difficulty, number>>;
  readonly minOptions: number;
  readonly similarityWeights: SimilarityWeights;
  /** Voices of the spoken word, per language. */
  readonly voices: Readonly<Record<Language, string>>;
  /** Slow replay rate (key L). */
  readonly slowRate: number;
  readonly feedbackCorrectMs: number;
  /** English words heard the same: never two right answers in an audio question. */
  readonly englishHomophones: readonly (readonly string[])[];
}

export const MINI_GAME_CONFIG: MiniGameConfig = Object.freeze({
  adaptive: Object.freeze({
    initialLevel: 2,
    windowSize: 8,
    upMinCorrect: 7,
    downMaxCorrect: 5,
    sproutMaxLevel: 2,
  }),
  optionsByLevel: Object.freeze({ 1: 3, 2: 4, 3: 4 }),
  minOptions: 2,
  similarityWeights: Object.freeze({
    zh: Object.freeze({
      sameLength: 1,
      sharedChar: 2,
      sharedCharMax: 2,
      sameSyllableToneless: 2,
      sameTonePattern: 1,
      sameInitialOrFinal: 0.5,
      sharedLabel: 1.5,
    }),
    en: Object.freeze({
      lengthWithin1: 1,
      levenshteinLe2: 3,
      levenshteinEq3: 1.5,
      samePrefix2: 1,
      sameSuffix3: 1.5,
      minimalPair: 4,
      sharedLabel: 1.5,
    }),
  }),
  voices: Object.freeze({ zh: 'zh-CN', en: 'en-GB' }),
  slowRate: 0.6,
  feedbackCorrectMs: 900,
  englishHomophones: Object.freeze(
    [
      ['two', 'too', 'to'],
      ['their', 'there', "they're"],
      ['your', "you're"],
      ['its', "it's"],
      ['right', 'write'],
      ['hear', 'here'],
      ['know', 'no'],
      ['new', 'knew'],
      ['see', 'sea'],
      ['buy', 'by', 'bye'],
      ['four', 'for'],
      ['one', 'won'],
      ['eight', 'ate'],
      ['weather', 'whether'],
      ['week', 'weak'],
      ['wear', 'where'],
      ['flour', 'flower'],
      ['meet', 'meat'],
      ['road', 'rode'],
      ['sun', 'son'],
    ].map((group) => Object.freeze(group)),
  ),
});
