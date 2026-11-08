import type { ExerciseType, PathStep } from '../progressRecords';

/** The seven steps of a label's path, in the order they unlock (GAME_DESIGN.md 5.1). */
export const PATH_STEPS: readonly PathStep[] = Object.freeze([
  'discover',
  'listen',
  'recognize',
  'type',
  'dictation',
  'sentences',
  'finalChallenge',
]);

/**
 * The step each exercise feeds (GAME_DESIGN.md 5.1). A record rather than a switch, so that a
 * new exercise type cannot be forgotten. The final challenge mixes exercises of other steps.
 */
const STEP_OF_EXERCISE: Readonly<Record<ExerciseType, PathStep | undefined>> = Object.freeze({
  discovery: 'discover',
  audioFlashcard: undefined,
  listenMeaning: 'listen',
  listenType: 'dictation',
  toneEcho: 'recognize',
  bridgeMatch: 'recognize',
  sentenceListen: 'sentences',
  sentenceShuffle: 'sentences',
  typeEcho: 'type',
  typeMeaning: undefined,
  seasonRush: undefined,
});

/** The step an answer counts for, if any. */
export function stepOfExercise(exercise: ExerciseType): PathStep | undefined {
  return STEP_OF_EXERCISE[exercise];
}
