import type { PathStep } from '../progressRecords';
import type { PathConfig } from './pathConfig';
import { stepWords, type PathInput } from './pathStatus';

type CostedStep = Exclude<PathStep, 'finalChallenge'>;

/** The exercise whose cost sizes a step session (GAME_DESIGN.md 11, itemCostSec). */
const COST_OF_STEP: Readonly<Record<CostedStep, keyof PathConfig['itemCostSec']>> = {
  discover: 'discovery',
  listen: 'listenMeaning',
  recognize: 'bridgeMatchPair',
  type: 'typeEcho',
  dictation: 'listenType',
  sentences: 'sentenceListen',
};

/**
 * "Continuer l'étape" (GAME_DESIGN.md 5.3): the words not meeting the criterion of the step
 * yet, least remembered first, as many as fit in `stepSessionTargetSec`.
 */
export function stepSessionWords(
  step: PathStep,
  input: PathInput,
  retrievability: (cardId: string) => number,
  config: Pick<PathConfig, 'stepSessionTargetSec' | 'itemCostSec'>,
): string[] {
  const counted = stepWords(step, input);
  if (step === 'finalChallenge' || counted === undefined) {
    return [];
  }
  const fitting = Math.floor(config.stepSessionTargetSec / config.itemCostSec[COST_OF_STEP[step]]);
  return counted.words
    .filter((card) => !counted.meets(card))
    .map(({ id }, order) => ({ id, order, recall: retrievability(id) }))
    .sort((a, b) => a.recall - b.recall || a.order - b.order)
    .slice(0, fitting)
    .map(({ id }) => id);
}
