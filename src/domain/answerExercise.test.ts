import { describe, expect, it } from 'vitest';
import { answerExerciseFor } from './answerExercise';

const sequence = (seed: string, length = 6) =>
  Array.from({ length }, (_, index) => answerExerciseFor('mixed', seed, index));

describe('answerExerciseFor', () => {
  it.each(['selfAssess', 'typeMeaning', 'typeWord'] as const)(
    'asks every card the same way in the mode "%s"',
    (mode) => {
      expect([0, 1, 7].map((index) => answerExerciseFor(mode, 'seed', index))).toEqual([
        mode,
        mode,
        mode,
      ]);
    },
  );

  it('alternates typing the meaning and typing the word in the mixed mode', () => {
    const asked = sequence('session-1');

    expect(asked.every((exercise, index) => exercise !== asked[index + 1])).toBe(true);
    expect(new Set(asked)).toEqual(new Set(['typeMeaning', 'typeWord']));
  });

  it('gives the same order again for the same session seed', () => {
    expect(sequence('session-1')).toEqual(sequence('session-1'));
  });

  it('starts with either exercise, depending on the seed', () => {
    const firsts = new Set(
      Array.from({ length: 20 }, (_, n) => answerExerciseFor('mixed', `seed-${String(n)}`, 0)),
    );

    expect(firsts).toEqual(new Set(['typeMeaning', 'typeWord']));
  });
});
