import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from '../progressRecords';
import { PATH_STEPS, stepOfExercise } from './pathSteps';

describe('stepOfExercise', () => {
  it.each([
    ['discovery', 'discover'],
    ['listenMeaning', 'listen'],
    ['bridgeMatch', 'recognize'],
    ['toneEcho', 'recognize'],
    ['typeEcho', 'type'],
    ['listenType', 'dictation'],
    ['sentenceListen', 'sentences'],
    ['sentenceShuffle', 'sentences'],
  ] as const)('places an answer in %s in the step %s of the path', (exercise, step) => {
    expect(stepOfExercise(exercise)).toBe(step);
  });

  it.each(['audioFlashcard', 'typeMeaning', 'seasonRush'] as const)(
    'leaves %s out of every step, as it belongs to none',
    (exercise) => {
      expect(stepOfExercise(exercise)).toBeUndefined();
    },
  );

  it('knows every exercise type', () => {
    for (const exercise of EXERCISE_TYPES) {
      const step = stepOfExercise(exercise);
      expect(step === undefined || PATH_STEPS.includes(step)).toBe(true);
    }
  });
});

describe('PATH_STEPS', () => {
  it('lists the seven steps in the order they unlock', () => {
    expect(PATH_STEPS).toEqual([
      'discover',
      'listen',
      'recognize',
      'type',
      'dictation',
      'sentences',
      'finalChallenge',
    ]);
  });
});
