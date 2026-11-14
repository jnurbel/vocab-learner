import type { HskWord } from './sentenceData';
import { KNOWN_HSK_LEVEL, segmentChinese, splitNumbers } from './words';

/** The frequent errors of a learner of Chinese (DESIGN.md 5 ter), in the order they are told. */
export type ErrorRule =
  | 'missingClassifier'
  | 'erBeforeClassifier'
  | 'menAfterNumber'
  | 'buYou'
  | 'biWithHen'
  | 'shiBeforeAdjective'
  | 'maWithQuestionWord';

/** A rule "to check" may be right: it is never shown as a mistake (GAME_DESIGN.md 6.12). */
export type ErrorLevel = 'error' | 'toCheck';

export interface FoundError {
  rule: ErrorRule;
  level: ErrorLevel;
  /** The faulty words, as written in the sentence. */
  excerpt: string;
  /** The clause corrected. */
  suggestion: string;
}

export interface RuleResources {
  classifiers: ReadonlySet<string>;
  /** Nouns counted with a measure word, with the one to propose first. */
  countableNouns: ReadonlyMap<string, string>;
}

/** Measure words common enough to be recognised without the table of nouns. */
const COMMON_CLASSIFIERS = Array.from(
  '个位名口只头匹条张片块本册部件套双辆台架座栋间根支杯瓶碗盒篇首段封次场顿把节家所门棵朵层道份种些',
);

/** The measure word proposed first when a noun has several: the most frequent one. */
const PREFERRED_CLASSIFIERS = Array.from('个本张条件只辆位双杯台把家所门棵朵块封首篇');

/** Nouns or words counted without a measure word: 三年, 两天, 五岁, 三次, 一万人... */
const NO_CLASSIFIER_NEEDED = new Set([
  '年',
  '天',
  '月',
  '号',
  '岁',
  '周',
  '星期',
  '小时',
  '分钟',
  '分',
  '秒',
  '点',
  '次',
  '倍',
  '人',
  '口',
  '元',
  '块',
  '毛',
  '公斤',
  '公里',
  '米',
  '层',
  '楼',
  '页',
  '课',
  '世纪',
  '晚',
  '夜',
  '代',
  '辈子',
  '生',
  '方面',
  '样',
  '些',
  '起',
  '直',
  '定',
  '切',
  '般',
  '会儿',
  '下',
  '边',
  '面',
]);

/** 有 adjectives: 不有趣 is right. */
const YOU_ADJECTIVES = ['有趣', '有名', '有用', '有效', '有利', '有关', '有礼貌', '有意思', '有力'];
/** Words holding 比 or 很 that are not a comparison with 很. */
const NOT_A_COMPARISON = /比较|比赛|比如|比尔|对比|比例|很多|很久/g;
const QUESTION_WORD = /什么|谁|哪|怎么|为什么|多少|几/;
/** An indirect question, or 什么 meaning "something": the 吗 may be right. */
const EMBEDDING =
  /知道|告诉|记得|明白|问|猜|解释|看看|想想|确定|清楚|说说|能|可以|会不会|有没有|有什么|什么事|要什么|想要什么|吃什么|喝什么|还有|任何/;
/** Words holding 是 that are not the verb "to be". */
const NOT_THE_VERB_SHI = /还是|就是|也是|不是|果然是|一是|二是|又/g;
const SUBJECT_MAX_LENGTH = 6;
const NOT_A_SUBJECT = /什么|的最|原因|方法|思想|本质/;
/** Adjectives said with 很, never with 是, at the end of a clause. */
const PLAIN_ADJECTIVES = new Set([
  '高',
  '矮',
  '胖',
  '瘦',
  '大',
  '小',
  '好',
  '冷',
  '热',
  '忙',
  '累',
  '饿',
  '渴',
  '漂亮',
  '高兴',
  '快乐',
  '聪明',
  '勇敢',
  '幸福',
  '难',
  '容易',
  '贵',
  '便宜',
  '远',
  '近',
  '多',
  '少',
  '长',
  '短',
  '新',
  '旧',
  '快',
  '慢',
  '早',
  '晚',
  '干净',
  '舒服',
  '可爱',
  '认真',
  '安静',
  '辛苦',
  '自私',
  '健康',
  '有名',
  '重要',
  '简单',
  '奇怪',
  '年轻',
  '热情',
  '努力',
  '满意',
  '紧张',
  '着急',
  '生气',
  '难过',
  '害怕',
]);

const NUMBER = /^(?:[一二两三四五六七八九十百千万几]+|\d+)$/u;
const PUNCTUATION = /^[\p{P}\p{S}\s]+$/u;
const NOUN_TAGS = new Set(['n', 'nr', 'nz', 'ng']);

/**
 * What the rules need from the data: the measure words of the nouns (CC-CEDICT) and the HSK
 * words, of which the nouns up to HSK 3 are counted with a measure word too.
 */
export function createRuleResources(
  measureWords: ReadonlyMap<string, readonly string[]>,
  hsk: ReadonlyMap<string, HskWord>,
): RuleResources {
  const classifiers = new Set(COMMON_CLASSIFIERS);
  const countableNouns = new Map<string, string>();
  for (const [noun, { level, pos }] of hsk) {
    if (level <= KNOWN_HSK_LEVEL && pos.some((tag) => NOUN_TAGS.has(tag))) {
      countableNouns.set(noun, '个');
    }
  }
  for (const [noun, list] of measureWords) {
    list.forEach((classifier) => classifiers.add(classifier));
    const proposed =
      PREFERRED_CLASSIFIERS.find((classifier) => list.includes(classifier)) ??
      list.find((classifier) => classifier !== '');
    if (proposed !== undefined) {
      countableNouns.set(noun, proposed);
    }
  }
  return { classifiers, countableNouns };
}

/**
 * The frequent errors of a sentence, clause by clause (between two punctuation marks), on its
 * words with the numbers cut from their measure words. Only what these rules know is checked:
 * finding nothing never means that the sentence is right. The words come from Intl.Segmenter,
 * whose cut differs from one browser to another.
 */
export function findFrequentErrors(
  sentence: string,
  resources: RuleResources,
  segment: (text: string) => string[] = segmentChinese,
): FoundError[] {
  const words = splitNumbers(
    segment(sentence),
    resources.classifiers,
    new Set(resources.countableNouns.keys()),
  );
  let current: string[] = [];
  const clauses = [current];
  for (const word of words) {
    if (PUNCTUATION.test(word)) {
      current = [];
      clauses.push(current);
    } else {
      current.push(word);
    }
  }
  const filled = clauses.filter((clause) => clause.length > 0);
  return RULES.flatMap(({ rule, level, find }) =>
    filled.flatMap((clause) => {
      const found = find(clause, resources);
      return found === undefined ? [] : [{ rule, level, ...found }];
    }),
  );
}

type Finding = Pick<FoundError, 'excerpt' | 'suggestion'>;

interface Rule {
  rule: ErrorRule;
  level: ErrorLevel;
  find: (clause: readonly string[], resources: RuleResources) => Finding | undefined;
}

/** A word of a clause with its neighbours, absent at the edges of the clause. */
interface Position {
  index: number;
  before: string | undefined;
  word: string;
  next: string | undefined;
  afterNext: string | undefined;
}

function positions(clause: readonly string[]): Position[] {
  return clause.map((word, index) => ({
    index,
    before: clause[index - 1],
    word,
    next: clause[index + 1],
    afterNext: clause[index + 2],
  }));
}

/** The words of a clause with the word at `index` replaced by `by` (none: removed). */
function replaced(clause: readonly string[], index: number, ...by: string[]): string {
  return [...clause.slice(0, index), ...by, ...clause.slice(index + 1)].join('');
}

/** The same text with each match hidden by as many marks: indexes stay valid. */
function masked(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => '#'.repeat(match.length));
}

function findMissingClassifier(
  clause: readonly string[],
  { classifiers, countableNouns }: RuleResources,
): Finding | undefined {
  for (const { index, before, word, next } of positions(clause)) {
    const proposed = next === undefined ? undefined : countableNouns.get(next);
    if (
      next !== undefined &&
      proposed !== undefined &&
      NUMBER.test(word) &&
      word !== '一' &&
      before !== '第' &&
      !classifiers.has(next) &&
      !NO_CLASSIFIER_NEEDED.has(next)
    ) {
      return { excerpt: word + next, suggestion: replaced(clause, index, word, proposed) };
    }
  }
  return undefined;
}

function findErBeforeClassifier(
  clause: readonly string[],
  { classifiers }: RuleResources,
): Finding | undefined {
  for (const { index, before, word, next } of positions(clause)) {
    if (
      word === '二' &&
      next !== undefined &&
      classifiers.has(next) &&
      !NO_CLASSIFIER_NEEDED.has(next) &&
      !['第', '十', '一'].includes(before ?? '')
    ) {
      return { excerpt: `二${next}`, suggestion: replaced(clause, index, '两') };
    }
  }
  return undefined;
}

function findMenAfterNumber(
  clause: readonly string[],
  { classifiers }: RuleResources,
): Finding | undefined {
  for (const { index, word, next, afterNext } of positions(clause)) {
    if (!NUMBER.test(word) || next === undefined || !classifiers.has(next)) {
      continue;
    }
    if (afterNext !== undefined && afterNext.length > 1 && afterNext.endsWith('们')) {
      return {
        excerpt: afterNext,
        suggestion: replaced(clause, index + 2, afterNext.slice(0, -1)),
      };
    }
    if (afterNext !== undefined && clause[index + 3] === '们') {
      return { excerpt: `${afterNext}们`, suggestion: replaced(clause, index + 3) };
    }
  }
  return undefined;
}

const RULES: readonly Rule[] = [
  { rule: 'missingClassifier', level: 'error', find: findMissingClassifier },
  { rule: 'erBeforeClassifier', level: 'error', find: findErBeforeClassifier },
  { rule: 'menAfterNumber', level: 'error', find: findMenAfterNumber },
  {
    rule: 'buYou',
    level: 'error',
    find: (clause) => {
      const text = clause.join('');
      const right = YOU_ADJECTIVES.some((adjective) => text.includes(`不${adjective}`));
      return text.includes('不有') && !right
        ? { excerpt: '不有', suggestion: text.replace('不有', '没有') }
        : undefined;
    },
  },
  {
    rule: 'biWithHen',
    level: 'error',
    find: (clause) => {
      const text = clause.join('');
      const plain = masked(text, NOT_A_COMPARISON);
      const bi = plain.indexOf('比');
      const hen = bi === -1 ? -1 : plain.indexOf('很', bi);
      return hen === -1
        ? undefined
        : { excerpt: '很', suggestion: text.slice(0, hen) + text.slice(hen + 1) };
    },
  },
  {
    rule: 'shiBeforeAdjective',
    level: 'error',
    find: (clause) => {
      const text = clause.join('');
      const parts = /^(.*?)是(.+)$/u.exec(masked(text, NOT_THE_VERB_SHI));
      const [subject, adjective] = [parts?.[1] ?? '', parts?.[2] ?? ''];
      const flagged =
        PLAIN_ADJECTIVES.has(adjective) &&
        subject.length <= SUBJECT_MAX_LENGTH &&
        !NOT_A_SUBJECT.test(subject);
      return flagged
        ? { excerpt: `是${adjective}`, suggestion: `${subject}很${adjective}` }
        : undefined;
    },
  },
  {
    rule: 'maWithQuestionWord',
    level: 'toCheck',
    find: (clause) => {
      const text = clause.join('');
      return clause.at(-1) === '吗' && QUESTION_WORD.test(text) && !EMBEDDING.test(text)
        ? { excerpt: '吗', suggestion: text.slice(0, -1) }
        : undefined;
    },
  },
];
