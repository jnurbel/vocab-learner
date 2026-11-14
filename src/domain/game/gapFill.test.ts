import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { BankSentence } from '../sentence/sentenceData';
import { GAME_CONFIG } from '../srs/config';
import {
  gapFillChoiceAnswer,
  gapFillQuestion,
  gapFillSentenceOf,
  gapFillTypedOutcome,
  isGapFillEligible,
  type BankLookup,
} from './gapFill';
import { MINI_GAME_CONFIG } from './miniGameConfig';

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

function bankSentence(id: number, cut: string, lang: 'fr' | 'en' = 'fr'): BankSentence {
  const words = cut.split(' ');
  return {
    id,
    author: 'sysko',
    words,
    text: words.join(''),
    translation: { lang, id: id + 1, author: 'Scott', text: 'Mon ami est là.' },
    t2s: false,
    cc0: false,
  };
}

const friendSentence = bankSentence(7, '我 的 朋友 来 了 。');
const bank: BankLookup = (card) => (card.term === '朋友' ? [friendSentence] : []);
const none: BankLookup = () => [];

describe('the sentence of a gap-fill question', () => {
  it('is the example of the word first, without translation', () => {
    const sentence = gapFillSentenceOf(word('朋友', { example: '他是我的朋友。' }), bank, 's');

    expect(sentence).toEqual({
      text: '他是我的朋友。',
      parts: { before: '他是我的', term: '朋友', after: '。' },
    });
  });

  it('is a bank sentence, with its translation and source, for a word without example', () => {
    const sentence = gapFillSentenceOf(word('朋友'), bank, 's');

    expect(sentence).toEqual({
      text: '我的朋友来了。',
      parts: { before: '我的', term: '朋友', after: '来了。' },
      translation: { lang: 'fr', text: 'Mon ami est là.' },
      bank: friendSentence,
    });
  });

  it('takes the bank when the example is too long or lacks the word', () => {
    expect(gapFillSentenceOf(word('朋友', { example: '我没有钱。' }), bank, 's')?.bank).toBe(
      friendSentence,
    );
    expect(
      gapFillSentenceOf(word('朋友', { example: `${'很'.repeat(19)}朋友` }), bank, 's')?.bank,
    ).toBe(friendSentence);
  });

  it('keeps an English example of at most 15 words, and never looks in the bank for English', () => {
    const english = (example: string) => word('cat', { language: 'en', example });
    const lookups: Card[] = [];
    const spy: BankLookup = (card) => {
      lookups.push(card);
      return [];
    };

    expect(gapFillSentenceOf(english('My cat sleeps.'), spy, 's')?.parts.term).toBe('cat');
    expect(gapFillSentenceOf(english(`My cat ${'very '.repeat(13)}big.`), spy, 's')).toBe(
      undefined,
    );
    expect(lookups).toEqual([]);
  });

  it('is none for a word with neither example nor bank sentence', () => {
    expect(gapFillSentenceOf(word('政府'), bank, 's')).toBeUndefined();
    expect(gapFillSentenceOf(word('朋友'), undefined, 's')).toBeUndefined();
  });
});

describe('isGapFillEligible', () => {
  it('needs a sentence, from the example or the bank', () => {
    expect(isGapFillEligible(word('朋友'), bank)).toBe(true);
    expect(isGapFillEligible(word('时间', { example: '我没有时间。' }), none)).toBe(true);
    expect(isGapFillEligible(word('政府'), bank)).toBe(false);
  });
});

describe('a gap-fill question', () => {
  const target = word('朋友');
  const sentence = gapFillSentenceOf(target, bank, 's');
  const others = ['时间', '学生', '老师', '电脑', '我'].map((term) => word(term));
  const pool = { cards: [target, ...others], introduced: new Set<string>() };
  const settings = (level: 1 | 2 | 3) => ({ level, stage: 'bud' as const, seed: 'seed' });

  it('offers 3 written words at level 1 and 4 at level 2, the right one among them', () => {
    if (sentence === undefined) {
      throw new Error('No sentence');
    }
    const easy = gapFillQuestion(target, sentence, pool, settings(1), MINI_GAME_CONFIG);
    const medium = gapFillQuestion(target, sentence, pool, settings(2), MINI_GAME_CONFIG);

    expect(easy.mode).toBe('choice');
    expect(easy.options).toHaveLength(3);
    expect(medium.options).toHaveLength(4);
    expect(medium.options).toContain(target);
  });

  it('never offers a word that the sentence holds: two right answers', () => {
    if (sentence === undefined) {
      throw new Error('No sentence');
    }
    const question = gapFillQuestion(target, sentence, pool, settings(2), MINI_GAME_CONFIG);

    expect(question.options.map(({ term }) => term)).not.toContain('我');
  });

  it('asks to type the word at level 3', () => {
    if (sentence === undefined) {
      throw new Error('No sentence');
    }
    const question = gapFillQuestion(target, sentence, pool, settings(3), MINI_GAME_CONFIG);

    expect(question).toMatchObject({ mode: 'typed', options: [], difficulty: 3 });
  });

  it('asks to type the word when no other word can be offered', () => {
    if (sentence === undefined) {
      throw new Error('No sentence');
    }
    const alone = { cards: [target], introduced: new Set<string>() };

    expect(gapFillQuestion(target, sentence, alone, settings(1), MINI_GAME_CONFIG).mode).toBe(
      'typed',
    );
  });
});

describe('the answer to a gap-fill question', () => {
  const target = word('朋友');
  const other = word('时间');
  const sentence = gapFillSentenceOf(target, bank, 's');
  const question = sentence && {
    target,
    sentence,
    options: [target, other],
    difficulty: 2 as const,
    mode: 'choice' as const,
  };

  it('is rated as a choice: right and quick is good, a hint makes it hard', () => {
    if (question === undefined) {
      throw new Error('No question');
    }
    const answer = (choice: Card | 'unknown', hintsUsed: number) =>
      gapFillChoiceAnswer(question, choice, { hintsUsed, responseMs: 1000 }, GAME_CONFIG);

    expect(answer(target, 0)).toEqual({ outcome: 'correct', rating: 'good' });
    expect(answer(target, 1)).toEqual({ outcome: 'correctWithHint', rating: 'hard' });
    expect(answer(other, 0)).toEqual({ outcome: 'wrong', rating: 'again' });
    expect(answer('unknown', 0)).toEqual({ outcome: 'wrong', rating: 'again' });
  });

  it('is rated as typed: a hint turns a right word into correctWithHint, time never counts', () => {
    expect(gapFillTypedOutcome('correct', 0)).toEqual({ outcome: 'correct', rating: 'good' });
    expect(gapFillTypedOutcome('correct', 2)).toEqual({
      outcome: 'correctWithHint',
      rating: 'hard',
    });
    expect(gapFillTypedOutcome('almost', 0)).toEqual({ outcome: 'almost', rating: 'hard' });
    expect(gapFillTypedOutcome('wrong', 0)).toEqual({ outcome: 'wrong', rating: 'again' });
  });
});
