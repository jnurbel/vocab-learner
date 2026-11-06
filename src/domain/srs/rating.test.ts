import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import { ratingFor, type AnswerContext } from './rating';

const fastChoice: AnswerContext = { exercise: 'choice', responseMs: 2000, hintsUsed: 0 };

describe('ratingFor', () => {
  it('rates a quick correct choice without hint as good', () => {
    expect(ratingFor('correct', fastChoice, GAME_CONFIG)).toBe('good');
  });

  it('still rates good a choice answered exactly at the slow threshold', () => {
    expect(ratingFor('correct', { ...fastChoice, responseMs: 8000 }, GAME_CONFIG)).toBe('good');
  });

  it('rates hard a correct choice that took longer than 8 seconds', () => {
    expect(ratingFor('correct', { ...fastChoice, responseMs: 8001 }, GAME_CONFIG)).toBe('hard');
  });

  it('ignores the response time of a typed answer, as typing speed varies too much', () => {
    expect(
      ratingFor('correct', { exercise: 'typed', responseMs: 60_000, hintsUsed: 0 }, GAME_CONFIG),
    ).toBe('good');
  });

  it('rates hard a correct answer given with a hint', () => {
    expect(ratingFor('correctWithHint', fastChoice, GAME_CONFIG)).toBe('hard');
    expect(ratingFor('correct', { ...fastChoice, hintsUsed: 1 }, GAME_CONFIG)).toBe('hard');
  });

  it('rates hard an English answer with a tolerated typo', () => {
    expect(
      ratingFor('almost', { exercise: 'typed', responseMs: 3000, hintsUsed: 0 }, GAME_CONFIG),
    ).toBe('hard');
  });

  it('rates again a wrong answer or "I do not know"', () => {
    expect(ratingFor('wrong', fastChoice, GAME_CONFIG)).toBe('again');
  });

  it('rates easy a new word the learner says they already know', () => {
    expect(ratingFor('correct', { ...fastChoice, knownAlready: true }, GAME_CONFIG)).toBe('easy');
  });

  it('does not reward an unmeasurable response time with good', () => {
    for (const responseMs of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ratingFor('correct', { ...fastChoice, responseMs }, GAME_CONFIG)).toBe('hard');
    }
  });

  it('follows the configured slow threshold', () => {
    expect(
      ratingFor(
        'correct',
        { ...fastChoice, responseMs: 3000 },
        { ...GAME_CONFIG, choiceSlowMs: 2500 },
      ),
    ).toBe('hard');
  });
});
