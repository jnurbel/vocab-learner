import { describe, expect, it } from 'vitest';
import type { PathProgressRecord } from '../progressRecords';
import { PATH_CONFIG } from './pathConfig';
import { recordStepAttempt } from './stepAttempts';

const empty: PathProgressRecord = { labelId: 'lesson', language: 'zh' };

describe('recordStepAttempt', () => {
  it('keeps a right answer in listenMeaning as the last attempt of the word in the listen step', () => {
    const progress = recordStepAttempt(empty, 'a', 'listenMeaning', 'correct', PATH_CONFIG);

    expect(progress.stepAttempts).toEqual({ listen: { a: true } });
  });

  it('keeps only the last attempt: a mistake after a success undoes it', () => {
    const first = recordStepAttempt(empty, 'a', 'typeEcho', 'correct', PATH_CONFIG);

    const second = recordStepAttempt(first, 'a', 'typeEcho', 'wrong', PATH_CONFIG);

    expect(second.stepAttempts).toEqual({ type: { a: false } });
  });

  it.each(['correctWithHint', 'almost', 'wrong', 'good'] as const)(
    'never counts %s as a success',
    (outcome) => {
      const progress = recordStepAttempt(empty, 'a', 'listenType', outcome, PATH_CONFIG);

      expect(progress.stepAttempts?.dictation).toEqual({ a: false });
    },
  );

  it('keeps the attempts of the other words and steps', () => {
    const before: PathProgressRecord = {
      ...empty,
      stepAttempts: { listen: { a: true }, type: { b: false } },
    };

    const after = recordStepAttempt(before, 'c', 'listenMeaning', 'wrong', PATH_CONFIG);

    expect(after.stepAttempts).toEqual({ listen: { a: true, c: false }, type: { b: false } });
    expect(before.stepAttempts).toEqual({ listen: { a: true }, type: { b: false } });
  });

  it('changes nothing for an exercise that belongs to no step', () => {
    expect(recordStepAttempt(empty, 'a', 'typeMeaning', 'correct', PATH_CONFIG)).toBe(empty);
  });

  it('counts bridgeMatch for the recognize step, word by word', () => {
    const progress = recordStepAttempt(empty, 'a', 'bridgeMatch', 'correct', PATH_CONFIG);

    expect(progress.stepAttempts).toEqual({ recognize: { a: true } });
  });

  it('keeps toneEcho items in a window of the last ones, apart from the words of bridgeMatch', () => {
    const config = { ...PATH_CONFIG, toneEchoWindow: 3 };
    let progress = recordStepAttempt(empty, 'a', 'bridgeMatch', 'correct', config);
    for (const outcome of ['wrong', 'correct', 'correct', 'correct'] as const) {
      progress = recordStepAttempt(progress, 'a', 'toneEcho', outcome, config);
    }

    expect(progress.toneEchoRecent).toEqual([true, true, true]);
    expect(progress.stepAttempts).toEqual({ recognize: { a: true } });
  });

  it('counts sentenceListen word by word and keeps the sentences put back in order apart', () => {
    const listened = recordStepAttempt(empty, 'a', 'sentenceListen', 'correct', PATH_CONFIG);

    const shuffled = recordStepAttempt(listened, 'b', 'sentenceShuffle', 'correct', PATH_CONFIG);

    expect(shuffled.stepAttempts).toEqual({ sentences: { a: true } });
    expect(shuffled.shuffledSentences).toEqual({ b: true });
  });

  it('stores a hostile card id as a plain key, never as the prototype', () => {
    const progress = recordStepAttempt(empty, '__proto__', 'listenMeaning', 'correct', PATH_CONFIG);

    const attempts = progress.stepAttempts?.listen ?? {};
    expect(Object.getPrototypeOf(attempts)).toBe(Object.prototype);
    expect(Object.keys(attempts)).toEqual(['__proto__']);
  });
});
