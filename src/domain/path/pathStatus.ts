import type { Card } from '../card';
import type { PathProgressRecord, PathStep, PathStepStatus } from '../progressRecords';
import type { ReviewState } from '../srs/reviewState';
import type { PathConfig } from './pathConfig';
import { PATH_STEPS } from './pathSteps';

/** What the state of a label's path is computed from, in one language. */
export interface PathInput {
  /** The words of the label in the language of the path. */
  cards: readonly Card[];
  states: readonly ReviewState[];
  progress?: PathProgressRecord;
  /**
   * Words that toneEcho (Chinese tones) or its close pairs (English) can ask, for the recognize
   * step. By default: the Chinese words with a pinyin, and no English word.
   */
  toneEchoEligible?: (card: Card) => boolean;
}

/** One step of the path, as the path screen shows it (GAME_DESIGN.md 8.4). */
export interface StepView {
  step: PathStep;
  status: PathStepStatus;
  /** Words meeting the criterion; for the final challenge, the best score out of 20. */
  done: number;
  required: number;
  total: number;
  /** True when the criterion is met, which validates the step once it is the current one. */
  met: boolean;
}

export interface PathView {
  steps: StepView[];
  /** The first step neither validated nor skipped; none once the path is complete. */
  current?: PathStep;
}

type PathConfigUsed = Pick<
  PathConfig,
  | 'stepPassRatio'
  | 'minExamplesForSentenceStep'
  | 'toneEchoWindow'
  | 'toneEchoMinEligibleWords'
  | 'finalChallengePassScore20'
>;

/** Floating point would ask 13 words out of 15 at 80 %: the product is rounded first. */
const PRECISION = 1e-9;
const SCORE_MAX = 20;

/** `ceil(ratio × total)`, the words a step asks (GAME_DESIGN.md 5.1). */
export function requiredWords(total: number, ratio: number): number {
  return Math.max(0, Math.ceil(total * ratio - PRECISION));
}

export function hasExample(card: Card): boolean {
  return (card.example ?? '').trim() !== '';
}

function defaultToneEchoEligible(card: Card): boolean {
  return card.language === 'zh' && (card.pinyin ?? '').trim() !== '';
}

/** The state of every step of a label's path: validated steps stay validated (5.1). */
export function pathStatus(input: PathInput, config: PathConfigUsed): PathView {
  const steps: StepView[] = [];
  let current: PathStep | undefined;
  for (const step of PATH_STEPS) {
    const counted = countStep(step, input, config);
    const status = statusOf(step, counted, input, config, current === undefined);
    if (status === 'current') {
      current = step;
    }
    steps.push({ step, status, ...counted });
  }
  return current === undefined ? { steps } : { steps, current };
}

function statusOf(
  step: PathStep,
  { met }: Count,
  { cards, progress }: PathInput,
  config: PathConfigUsed,
  firstOpen: boolean,
): PathStepStatus {
  if (progress?.steps?.[step] === 'validated' || (step === 'finalChallenge' && met)) {
    return 'validated';
  }
  if (step === 'sentences' && cards.filter(hasExample).length < config.minExamplesForSentenceStep) {
    return 'skipped';
  }
  return firstOpen ? 'current' : 'locked';
}

type Count = Omit<StepView, 'step' | 'status'>;

/** The words a step counts, and whether a word meets its criterion (GAME_DESIGN.md 5.1). */
export interface StepWords {
  words: Card[];
  meets: (card: Card) => boolean;
}

/** Undefined for the final challenge, which is judged on its score, not word by word. */
export function stepWords(
  step: PathStep,
  { cards, states, progress }: PathInput,
): StepWords | undefined {
  switch (step) {
    case 'finalChallenge':
      return undefined;
    case 'discover': {
      const introduced = new Set(states.filter(({ reps }) => reps >= 1).map((s) => s.cardId));
      return { words: [...cards], meets: ({ id }) => introduced.has(id) };
    }
    case 'sentences':
      return { words: cards.filter(hasExample), meets: rightIn(progress, step) };
    default:
      return { words: [...cards], meets: rightIn(progress, step) };
  }
}

function countStep(step: PathStep, input: PathInput, config: PathConfigUsed): Count {
  const { progress } = input;
  const counted = stepWords(step, input);
  if (counted === undefined) {
    const best = progress?.finalChallengeBest ?? 0;
    const required = config.finalChallengePassScore20;
    return { done: best, required, total: SCORE_MAX, met: best >= required };
  }
  const words = countWords(counted, config);
  if (step === 'recognize') {
    return { ...words, met: words.met && toneEchoMet(input, config) };
  }
  if (step === 'sentences') {
    const shuffled = counted.words.filter(({ id }) => progress?.shuffledSentences?.[id] === true);
    const enoughShuffled = shuffled.length >= Math.min(3, counted.words.length);
    return { ...words, met: words.met && enoughShuffled };
  }
  return words;
}

function rightIn(progress: PathProgressRecord | undefined, step: PathStep) {
  const attempts = progress?.stepAttempts?.[step];
  return ({ id }: Card) =>
    attempts !== undefined && Object.hasOwn(attempts, id) && attempts[id] === true;
}

function countWords({ words, meets }: StepWords, config: PathConfigUsed): Count {
  const total = words.length;
  const done = words.filter(meets).length;
  const required = requiredWords(total, config.stepPassRatio);
  return { done, required, total, met: total > 0 && done >= required };
}

/** With enough words to ask, 80 % of the last toneEcho items must be right (5.1, step 3). */
function toneEchoMet(
  { cards, progress, toneEchoEligible = defaultToneEchoEligible }: PathInput,
  config: PathConfigUsed,
): boolean {
  if (cards.filter(toneEchoEligible).length < config.toneEchoMinEligibleWords) {
    return true;
  }
  const recent = (progress?.toneEchoRecent ?? []).slice(-config.toneEchoWindow);
  const right = recent.filter(Boolean).length;
  return recent.length > 0 && right >= requiredWords(recent.length, config.stepPassRatio);
}
