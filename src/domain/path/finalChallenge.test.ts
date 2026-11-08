import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { PathProgressRecord } from '../progressRecords';
import {
  composeFinalChallenge,
  isReadyForExam,
  recordFinalChallenge,
  scoreFinalChallenge,
  type ChallengeAnswer,
} from './finalChallenge';
import { PATH_CONFIG } from './pathConfig';

function card(id: string): Card {
  return {
    id,
    language: 'zh',
    term: `词${id}`,
    translation: `mot ${id}`,
    labelIds: ['lesson'],
    source: 'manual',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  };
}

const many = (count: number) =>
  Array.from({ length: count }, (_, index) => card(`w${String(index).padStart(2, '0')}`));
const sizes = (count: number) =>
  composeFinalChallenge(many(count), () => 0.5, 'day', PATH_CONFIG).map(({ section, cardIds }) => [
    section,
    cardIds.length,
  ]);

describe('composeFinalChallenge', () => {
  it('asks each word once, in three sections: 30 % listening, 40 % dictation, 30 % translation', () => {
    expect(sizes(10)).toEqual([
      ['listening', 3],
      ['dictation', 4],
      ['translation', 3],
    ]);
    expect(sizes(25)).toEqual([
      ['listening', 8],
      ['dictation', 10],
      ['translation', 7],
    ]);
  });

  it('asks at most 30 words, the least remembered ones', () => {
    const words = many(40);
    const recall = (cardId: string) => (Number(cardId.slice(1)) < 30 ? 0.1 : 0.9);

    const sections = composeFinalChallenge(words, recall, 'day', PATH_CONFIG);

    const asked = sections.flatMap(({ cardIds }) => cardIds);
    expect(asked).toHaveLength(30);
    expect(asked.every((id) => Number(id.slice(1)) < 30)).toBe(true);
    expect(new Set(asked).size).toBe(30);
  });

  it('draws the same challenge on the same day, whatever the order of the words', () => {
    const first = composeFinalChallenge(many(12), () => 0.5, '2026-11-07', PATH_CONFIG);
    const again = composeFinalChallenge(
      [...many(12)].reverse(),
      () => 0.5,
      '2026-11-07',
      PATH_CONFIG,
    );

    expect(again).toEqual(first);
  });

  it('asks a single word in the translation section', () => {
    expect(sizes(1)).toEqual([
      ['listening', 0],
      ['dictation', 0],
      ['translation', 1],
    ]);
  });
});

describe('scoreFinalChallenge', () => {
  const answer = (section: ChallengeAnswer['section'], outcome: ChallengeAnswer['outcome']) => ({
    section,
    outcome,
  });

  it('scores out of 20 to the half point: a right answer is 1 point, an almost right one half', () => {
    const answers = [
      ...Array.from({ length: 7 }, () => answer('dictation', 'correct')),
      answer('dictation', 'almost'),
      answer('translation', 'wrong'),
      answer('listening', 'correctWithHint'),
    ];

    expect(scoreFinalChallenge(answers, 10, PATH_CONFIG)).toEqual({
      score20: 15,
      passed: false,
      sections: {
        listening: { correct: 0, total: 1 },
        dictation: { correct: 7, total: 8 },
        translation: { correct: 0, total: 1 },
      },
    });
  });

  it('passes from 16 out of 20', () => {
    const answers = Array.from({ length: 10 }, (_, index) =>
      answer('translation', index < 8 ? 'correct' : 'wrong'),
    );

    expect(scoreFinalChallenge(answers, 10, PATH_CONFIG)).toMatchObject({
      score20: 16,
      passed: true,
    });
  });

  it('rounds to the nearest half point and counts a question left unanswered as wrong', () => {
    const answers = Array.from({ length: 2 }, () => answer('listening', 'correct'));

    expect(scoreFinalChallenge(answers, 3, PATH_CONFIG).score20).toBe(13.5);
  });

  it('scores an empty challenge 0', () => {
    expect(scoreFinalChallenge([], 0, PATH_CONFIG).score20).toBe(0);
  });
});

describe('recordFinalChallenge', () => {
  const path: PathProgressRecord = { labelId: 'lesson', language: 'zh' };

  it('keeps the best score and tells the game a first success', () => {
    const recorded = recordFinalChallenge(path, 17, PATH_CONFIG);

    expect(recorded.progress).toEqual({
      ...path,
      finalChallengeBest: 17,
      steps: { finalChallenge: 'validated' },
    });
    expect(recorded.event).toEqual({
      type: 'FinalChallengeFinished',
      labelId: 'lesson',
      language: 'zh',
      score20: 17,
      passed: true,
      firstPass: true,
    });
  });

  it('never lowers the best score, and a later success is not a first one', () => {
    const passed: PathProgressRecord = {
      ...path,
      finalChallengeBest: 18,
      steps: { finalChallenge: 'validated' },
    };

    const recorded = recordFinalChallenge(passed, 16.5, PATH_CONFIG);

    expect(recorded.progress.finalChallengeBest).toBe(18);
    expect(recorded.event).toMatchObject({ passed: true, firstPass: false });
  });

  it('keeps a failed score as the best one so far, without validating the step', () => {
    const recorded = recordFinalChallenge(path, 12.5, PATH_CONFIG);

    expect(recorded.progress).toEqual({ ...path, finalChallengeBest: 12.5 });
    expect(recorded.event).toMatchObject({ passed: false, firstPass: false });
  });
});

describe('isReadyForExam', () => {
  it('is ready once the final challenge was passed, and stays so', () => {
    const path: PathProgressRecord = { labelId: 'lesson', language: 'zh' };

    expect(isReadyForExam(undefined, PATH_CONFIG)).toBe(false);
    expect(isReadyForExam({ ...path, finalChallengeBest: 15.5 }, PATH_CONFIG)).toBe(false);
    expect(isReadyForExam({ ...path, finalChallengeBest: 16 }, PATH_CONFIG)).toBe(true);
    expect(isReadyForExam({ ...path, steps: { finalChallenge: 'validated' } }, PATH_CONFIG)).toBe(
      true,
    );
  });
});
