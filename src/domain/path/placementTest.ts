import type { Card } from '../card';
import type { PathProgressRecord, PathStep, SessionResultRecord } from '../progressRecords';
import { createRng } from '../srs/random';
import { advancePath, validatedEvent, validateStep, type PathAdvance } from './advancePath';
import type { PathConfig } from './pathConfig';
import { hasExample, pathStatus, requiredWords, type PathInput } from './pathStatus';
import { stepOfExercise } from './pathSteps';

/** "Passer l'étape": the words drawn for a test on one step (GAME_DESIGN.md 5.2). */
export interface PlacementTest {
  step: PathStep;
  cardIds: string[];
}

export interface PlacementScore {
  step: PathStep;
  correct: number;
  total: number;
  passed: boolean;
}

/**
 * Draws `placementTestSize` different words of the label, at random but reproducibly for a
 * seed; every word when the label has fewer. The sentences step asks words with an example.
 */
export function drawPlacementTest(
  cards: readonly Card[],
  step: PathStep,
  seed: string,
  config: Pick<PathConfig, 'placementTestSize'>,
): PlacementTest {
  const candidates = step === 'sentences' ? cards.filter(hasExample) : [...cards];
  const cardIds = candidates
    .map(({ id }) => id)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, rank: createRng(`${seed}:${id}`)() }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, config.placementTestSize)
    .map(({ id }) => id);
  return { step, cardIds };
}

/**
 * Scores a test on the first answer of each word drawn, in an exercise of the step; a word
 * left unanswered is missed. Passed from `placementPassRatio` of the words.
 */
export function scorePlacementTest(
  test: PlacementTest,
  results: readonly SessionResultRecord[],
  config: Pick<PathConfig, 'placementPassRatio'>,
): PlacementScore {
  const asked = new Set(test.cardIds);
  const first = new Map<string, boolean>();
  for (const { cardId, exercise, outcome } of results) {
    const inStep = exercise !== undefined && stepOfExercise(exercise) === test.step;
    if (inStep && asked.has(cardId) && !first.has(cardId)) {
      first.set(cardId, outcome === 'correct');
    }
  }
  const correct = [...first.values()].filter(Boolean).length;
  const total = test.cardIds.length;
  const passed = total > 0 && correct >= requiredWords(total, config.placementPassRatio);
  return { step: test.step, correct, total, passed };
}

/**
 * A passed test validates its step if it is still the current one, then the next steps already
 * met. A failed test changes nothing: its answers already counted as usual.
 */
export function applyPlacementTest(
  input: PathInput & { progress: PathProgressRecord },
  score: PlacementScore,
  config: Parameters<typeof advancePath>[1],
): PathAdvance {
  const { current } = pathStatus(input, config);
  if (!score.passed || current !== score.step || current === 'finalChallenge') {
    return { progress: input.progress, events: [] };
  }
  const progress = validateStep(input.progress, current);
  const next = advancePath({ ...input, progress }, config);
  return {
    progress: next.progress,
    events: [validatedEvent(progress, current, 'placementTest'), ...next.events],
  };
}
