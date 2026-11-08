import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { GAME_CONFIG } from '../srs/config';
import { MINI_GAME_CONFIG } from './miniGameConfig';
import {
  containsTerm,
  isSentenceListenEligible,
  sentenceListenAnswer,
  sentenceListenQuestion,
} from './sentenceListen';

function word(term: string, overrides: Partial<Card> = {}): Card {
  return {
    id: term,
    language: 'zh',
    term,
    translation: `meaning of ${term}`,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const en = (term: string, example?: string) =>
  word(term, { language: 'en', ...(example === undefined ? {} : { example }) });

describe('containsTerm', () => {
  it('finds a Chinese word anywhere in the sentence', () => {
    expect(containsTerm('我没有时间。', word('时间'))).toBe(true);
    expect(containsTerm('我没有钱。', word('时间'))).toBe(false);
  });

  it('finds an English word as a whole word, whatever its case, with simple endings', () => {
    expect(containsTerm('Cats sleep a lot.', en('cat'))).toBe(true);
    expect(containsTerm('She walked home.', en('walk'))).toBe(true);
    expect(containsTerm('I am reading.', en('read'))).toBe(true);
    expect(containsTerm('The category is new.', en('cat'))).toBe(false);
  });

  it('reads a term with regex characters as plain text', () => {
    expect(containsTerm('It is cheap.', en('(cheap)'))).toBe(false);
    expect(containsTerm('cat', en('.at'))).toBe(false);
    expect(containsTerm('any sentence', en('  '))).toBe(false);
    expect(containsTerm('a+b is c', en('a+b'))).toBe(true);
  });
});

describe('isSentenceListenEligible', () => {
  it('needs an example that holds the word', () => {
    expect(isSentenceListenEligible(word('时间', { example: '我没有时间。' }))).toBe(true);
    expect(isSentenceListenEligible(word('时间'))).toBe(false);
    expect(isSentenceListenEligible(word('时间', { example: '我没有钱。' }))).toBe(false);
  });

  it('leaves out sentences too long to hear: 40 characters in Chinese, 25 words in English', () => {
    expect(isSentenceListenEligible(word('时间', { example: `${'很'.repeat(38)}时间` }))).toBe(
      true,
    );
    expect(isSentenceListenEligible(word('时间', { example: `${'很'.repeat(39)}时间` }))).toBe(
      false,
    );
    expect(isSentenceListenEligible(en('cat', `${'a '.repeat(24)}cat`))).toBe(true);
    expect(isSentenceListenEligible(en('cat', `${'a '.repeat(25)}cat`))).toBe(false);
  });
});

describe('sentenceListenQuestion', () => {
  const target = word('时间', { example: '我没有时间吃饭。', pinyin: 'shíjiān' });
  const pool = {
    cards: [
      target,
      word('吃饭', { pinyin: 'chīfàn' }),
      word('事件', { pinyin: 'shìjiàn' }),
      word('实际', { pinyin: 'shíjì' }),
      word('猫', { pinyin: 'māo' }),
    ],
    introduced: new Set<string>(),
  };

  it('offers the word heard among written words, never another word of the sentence', () => {
    const question = sentenceListenQuestion(
      target,
      pool,
      { level: 2, stage: 'stem', seed: 's' },
      MINI_GAME_CONFIG,
    );

    expect(question?.sentence).toBe('我没有时间吃饭。');
    expect(question?.options).toContain(target);
    expect(question?.options.map(({ term }) => term)).not.toContain('吃饭');
    expect(question?.options).toHaveLength(4);
  });

  it('asks nothing of a word that is not eligible, nor without another word to offer', () => {
    const settings = { level: 2 as const, stage: 'stem' as const, seed: 's' };
    expect(sentenceListenQuestion(word('猫'), pool, settings, MINI_GAME_CONFIG)).toBeUndefined();
    expect(
      sentenceListenQuestion(
        target,
        { cards: [target], introduced: new Set() },
        settings,
        MINI_GAME_CONFIG,
      ),
    ).toBeUndefined();
  });

  it('rates the answer as a choice: right and quick is good, wrong is again', () => {
    const question = sentenceListenQuestion(
      target,
      pool,
      { level: 1, stage: 'stem', seed: 's' },
      MINI_GAME_CONFIG,
    );
    if (question === undefined) {
      throw new Error('No question');
    }
    const wrong = question.options.find((option) => option !== target);

    expect(
      sentenceListenAnswer(question, target, { hintsUsed: 0, responseMs: 2000 }, GAME_CONFIG),
    ).toEqual({ outcome: 'correct', rating: 'good' });
    expect(
      sentenceListenAnswer(
        question,
        wrong ?? 'unknown',
        { hintsUsed: 0, responseMs: 1 },
        GAME_CONFIG,
      ),
    ).toEqual({ outcome: 'wrong', rating: 'again' });
  });
});
