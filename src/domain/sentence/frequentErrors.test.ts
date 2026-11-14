import { describe, expect, it } from 'vitest';
import {
  createRuleResources,
  findFrequentErrors,
  type ErrorRule,
  type RuleResources,
} from './frequentErrors';
import type { HskWord } from './sentenceData';

const noun = (level = 1): HskWord => ({ level, pos: ['n'] });

const resources: RuleResources = createRuleResources(
  new Map([
    ['书', ['册', '本', '部']],
    ['朋友', ['个', '位']],
    ['孩子', ['个']],
    ['电脑', ['台', '部']],
  ]),
  new Map([
    ['书', noun()],
    ['朋友', noun()],
    ['妹妹', noun()],
    ['孩子', noun()],
    ['学生', noun()],
    ['电脑', noun()],
    ['钱', noun()],
    ['年', { level: 1, pos: ['n', 'q'] }],
  ]),
);

const rulesOf = (sentence: string) =>
  findFrequentErrors(sentence, resources).map(({ rule }) => rule);

/** Learner mistakes and their corrections (DESIGN.md 5 ter, measured with rules.cjs). */
const PAIRS: readonly (readonly [string, string, ErrorRule])[] = [
  ['我有三书。', '我有三本书。', 'missingClassifier'],
  ['我有两朋友。', '我有两个朋友。', 'missingClassifier'],
  ['他有三妹妹。', '他有三个妹妹。', 'missingClassifier'],
  ['我们家有四孩子。', '我们家有四个孩子。', 'missingClassifier'],
  ['你有几本书吗？', '你有几本书？', 'maWithQuestionWord'],
  ['谁是你的老师吗？', '谁是你的老师？', 'maWithQuestionWord'],
  ['今天比昨天很冷。', '今天比昨天冷多了。', 'biWithHen'],
  ['他家不有电脑。', '他家没有电脑。', 'buYou'],
  ['她是漂亮。', '她很漂亮。', 'shiBeforeAdjective'],
  ['我有二个朋友。', '我有两个朋友。', 'erBeforeClassifier'],
  ['三个学生们来了。', '三个学生来了。', 'menAfterNumber'],
  ['我不有钱。', '我没有钱。', 'buYou'],
  ['你叫什么名字吗？', '你叫什么名字？', 'maWithQuestionWord'],
  ['他比我很高。', '他比我高。', 'biWithHen'],
  ['我是高。', '我很高。', 'shiBeforeAdjective'],
  ['我的父母是幸福。', '我的父母很幸福。', 'shiBeforeAdjective'],
  ['他是勇敢。', '他很勇敢。', 'shiBeforeAdjective'],
];

describe('the frequent errors of a learner', () => {
  it.each(PAIRS)('flags %s, and not its correction %s', (wrong, right, rule) => {
    expect(rulesOf(wrong)).toContain(rule);
    expect(rulesOf(right)).toEqual([]);
  });

  it('proposes a correction and points at the faulty words', () => {
    expect(findFrequentErrors('我有三书。', resources)).toEqual([
      { rule: 'missingClassifier', level: 'error', excerpt: '三书', suggestion: '我有三本书' },
    ]);
    expect(findFrequentErrors('我有二个朋友。', resources)[0]).toMatchObject({
      excerpt: '二个',
      suggestion: '我有两个朋友',
    });
    expect(findFrequentErrors('三个学生们来了。', resources)[0]).toMatchObject({
      excerpt: '学生们',
      suggestion: '三个学生来了',
    });
    expect(findFrequentErrors('我不有钱。', resources)[0]).toMatchObject({
      excerpt: '不有',
      suggestion: '我没有钱',
    });
    expect(findFrequentErrors('他比我很高。', resources)[0]).toMatchObject({
      excerpt: '很',
      suggestion: '他比我高',
    });
    expect(findFrequentErrors('我是高。', resources)[0]).toMatchObject({
      excerpt: '是高',
      suggestion: '我很高',
    });
  });

  it('only asks to check a 吗 with a question word, never calls it an error', () => {
    expect(findFrequentErrors('你叫什么名字吗？', resources)).toEqual([
      {
        rule: 'maWithQuestionWord',
        level: 'toCheck',
        excerpt: '吗',
        suggestion: '你叫什么名字',
      },
    ]);
  });

  it('proposes 个 for a noun missing from the table of measure words', () => {
    expect(findFrequentErrors('他有三妹妹。', resources)[0]?.suggestion).toBe('他有三个妹妹');
  });

  it('looks for the errors clause by clause, between punctuation marks', () => {
    expect(rulesOf('我很高，他是高。')).toEqual(['shiBeforeAdjective']);
    expect(findFrequentErrors('我很高，他是高。', resources)[0]?.suggestion).toBe('他很高');
  });
});

describe('the data of the rules', () => {
  it('proposes the measure word of the table when none of the usual ones fits', () => {
    const own = createRuleResources(new Map([['家庭', ['户']]]), new Map());

    expect(findFrequentErrors('三家庭。', own)[0]?.suggestion).toBe('三户家庭');
  });

  it('does not count a noun whose list of measure words is empty', () => {
    const own = createRuleResources(new Map([['家庭', []]]), new Map());

    expect(findFrequentErrors('三家庭。', own)).toEqual([]);
  });

  it('counts an HSK noun above level 3 only when it has a measure word', () => {
    const own = createRuleResources(new Map(), new Map([['政府', noun(5)]]));

    expect(findFrequentErrors('三政府。', own)).toEqual([]);
  });
});

describe('the exceptions of the rules', () => {
  it.each([
    ['一书 is left alone: 一 often goes without measure word', '我看一书。'],
    ['nouns that need no measure word', '我三年没回家。'],
    ['ordinal numbers', '我是第二个。'],
    ['二 inside a number', '他有十二个朋友。'],
    ['不 before an adjective in 有', '这本书不有趣。'],
    ['很多 and 很久 after 比', '他比我很多年前来的。'],
    ['words holding 比', '我们比较忙。'],
    ['an indirect question', '你知道他是谁吗？'],
    ['是 before a noun', '他是学生。'],
    ['是 in 还是', '你还是高。'],
    ['是 after a long subject', '我们班最好的那个学生是高。'],
  ])('leaves alone %s', (_, sentence) => {
    expect(rulesOf(sentence)).toEqual([]);
  });

  it('reads the words at the edges of a clause', () => {
    expect(rulesOf('我有三。')).toEqual([]);
    expect(rulesOf('他有二。')).toEqual([]);
    expect(rulesOf('三个们。')).toEqual([]);
    expect(rulesOf('我买了三个。')).toEqual([]);
    expect(findFrequentErrors('二个朋友来了。', resources)[0]?.suggestion).toBe('两个朋友来了');
  });

  it('finds 们 glued to its noun, as some browsers cut it', () => {
    const glued = (text: string) => text.split('|');

    expect(findFrequentErrors('三|个|学生们|来了', resources, glued)).toEqual([
      {
        rule: 'menAfterNumber',
        level: 'error',
        excerpt: '学生们',
        suggestion: '三个学生来了',
      },
    ]);
  });

  it('finds nothing in an empty or non-Chinese text', () => {
    expect(rulesOf('')).toEqual([]);
    expect(rulesOf('hello, 2 + 2 = 4')).toEqual([]);
  });

  it('reads at most a bounded length of a pasted text', () => {
    expect(rulesOf(`${'好'.repeat(5_000)}我是高。`)).toEqual([]);
  });
});
