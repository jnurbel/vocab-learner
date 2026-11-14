import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { createRuleResources } from '../sentence/frequentErrors';
import type { BankSentence } from '../sentence/sentenceData';
import {
  canKeepAsExample,
  checkWorkshopSentence,
  hasDetectedError,
  workshopModelSentence,
  type WorkshopResources,
} from './sentenceWorkshop';

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

const resources: WorkshopResources = {
  rules: createRuleResources(
    new Map([['书', ['本']]]),
    new Map([
      ['书', { level: 1, pos: ['n'] }],
      ['朋友', { level: 1, pos: ['n'] }],
    ]),
  ),
  known: new Set(['我', '有', '三', '本', '书', '是', '很', '高', '他', '的', '朋友', '了', '来']),
};

const friend = word('朋友');

describe('checking a sentence of the workshop', () => {
  it('finds nothing to say about a sentence with the word and known words', () => {
    const check = checkWorkshopSentence('我的朋友来了。', friend, resources);

    expect(check).toEqual({
      sentence: '我的朋友来了。',
      containsWord: true,
      length: 'ok',
      foreignCharacters: [],
      errors: [],
      toCheck: [],
      unknownWords: [],
    });
    expect(hasDetectedError(check)).toBe(false);
  });

  it('says when the word is missing', () => {
    const check = checkWorkshopSentence('我有三本书。', friend, resources);

    expect(check.containsWord).toBe(false);
    expect(hasDetectedError(check)).toBe(true);
  });

  it('asks for 4 to 40 characters, spaces left out', () => {
    expect(checkWorkshopSentence('朋 友', friend, resources).length).toBe('tooShort');
    expect(checkWorkshopSentence(`朋友${'很'.repeat(39)}`, friend, resources).length).toBe(
      'tooLong',
    );
    expect(hasDetectedError(checkWorkshopSentence('朋友。', friend, resources))).toBe(true);
  });

  it('lists the characters that are neither hanzi, digits nor punctuation', () => {
    const check = checkWorkshopSentence('我的朋友 Tom 来了<b>', friend, resources);

    expect(check.foreignCharacters).toEqual(['T', 'o', 'm', '<', 'b', '>']);
    expect(hasDetectedError(check)).toBe(true);
    expect(checkWorkshopSentence('我有3个朋友。', friend, resources).foreignCharacters).toEqual([]);
  });

  it('reports the frequent errors, and the rules to check apart', () => {
    const wrong = checkWorkshopSentence('我的朋友是高。', friend, resources);
    const toCheck = checkWorkshopSentence('谁是你的朋友吗？', friend, resources);

    expect(wrong.errors.map(({ rule }) => rule)).toEqual(['shiBeforeAdjective']);
    expect(hasDetectedError(wrong)).toBe(true);
    expect(toCheck.toCheck.map(({ rule }) => rule)).toEqual(['maWithQuestionWord']);
    expect(toCheck.errors).toEqual([]);
    expect(hasDetectedError(toCheck)).toBe(false);
  });

  it('lists the unknown words for information, never as an error', () => {
    const check = checkWorkshopSentence('我的朋友喜欢政治。', friend, resources);

    expect(check.unknownWords).toEqual(['喜欢', '政治']);
    expect(hasDetectedError(check)).toBe(false);
  });

  it('removes hidden controls and bounds a pasted text', () => {
    const rightToLeft = String.fromCodePoint(0x202e);
    const check = checkWorkshopSentence(`我的朋友${rightToLeft}来了。`, friend, resources);

    expect(check.sentence).toBe('我的朋友来了。');
    expect(
      Array.from(checkWorkshopSentence('好'.repeat(5_000), friend, resources).sentence),
    ).toHaveLength(200);
  });
});

describe('keeping a sentence as the example of the word', () => {
  it('is offered when the word has no example and no error was detected', () => {
    const check = checkWorkshopSentence('我的朋友来了。', friend, resources);

    expect(canKeepAsExample(friend, check)).toBe(true);
    expect(canKeepAsExample(word('朋友', { example: '他是我的朋友。' }), check)).toBe(false);
    expect(
      canKeepAsExample(friend, checkWorkshopSentence('我的朋友是高。', friend, resources)),
    ).toBe(false);
  });
});

describe('the model sentence', () => {
  const bankSentence: BankSentence = {
    id: 3,
    author: 'sysko',
    words: ['朋友', '来', '了', '。'],
    text: '朋友来了。',
    translation: { lang: 'en', id: 4, author: 'CK', text: 'The friend came.' },
    t2s: false,
    cc0: false,
  };

  it('is the example of the word, else a bank sentence, else none', () => {
    expect(
      workshopModelSentence(word('朋友', { example: '他是我的朋友。' }), () => [bankSentence], 's')
        ?.text,
    ).toBe('他是我的朋友。');
    expect(workshopModelSentence(friend, () => [bankSentence], 's')?.bank).toBe(bankSentence);
    expect(workshopModelSentence(friend, () => [], 's')).toBeUndefined();
  });

  it('accepts a long example, up to 40 characters', () => {
    const example = `${'很'.repeat(30)}朋友`;

    expect(workshopModelSentence(word('朋友', { example }), undefined, 's')?.text).toBe(example);
  });
});
