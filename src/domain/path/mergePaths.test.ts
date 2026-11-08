import { describe, expect, it } from 'vitest';
import type { PathProgressRecord } from '../progressRecords';
import { mergePaths } from './mergePaths';

const absorbed: PathProgressRecord = {
  labelId: 'animals',
  language: 'zh',
  steps: { discover: 'validated', listen: 'validated', recognize: 'validated' },
  stepAttempts: { listen: { cat: true, dog: false }, type: { cat: true } },
  finalChallengeBest: 17,
  toneEchoRecent: [true, true],
  shuffledSentences: { cat: true },
};

describe('mergePaths', () => {
  it('carries the validated steps of the absorbed label over to the label kept', () => {
    const kept: PathProgressRecord = {
      labelId: 'lesson',
      language: 'zh',
      steps: { discover: 'validated' },
      stepAttempts: { listen: { dog: true, bird: false } },
      finalChallengeBest: 12,
      toneEchoRecent: [false],
      shuffledSentences: { bird: true },
    };

    expect(mergePaths(absorbed, kept)).toEqual({
      labelId: 'lesson',
      language: 'zh',
      steps: { discover: 'validated', listen: 'validated', recognize: 'validated' },
      stepAttempts: { listen: { cat: true, dog: true, bird: false }, type: { cat: true } },
      finalChallengeBest: 17,
      toneEchoRecent: [false],
      shuffledSentences: { cat: true, bird: true },
    });
  });

  it('gives the absorbed path to a kept label that had none, under its own id', () => {
    expect(mergePaths(absorbed, { labelId: 'lesson', language: 'zh' })).toEqual({
      ...absorbed,
      labelId: 'lesson',
    });
  });

  it('keeps a path with nothing in it empty', () => {
    expect(
      mergePaths({ labelId: 'animals', language: 'en' }, { labelId: 'lesson', language: 'en' }),
    ).toEqual({ labelId: 'lesson', language: 'en' });
  });
});
