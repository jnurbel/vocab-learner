import type { Card } from '../card';
import { createRng } from '../srs/random';
import type { Outcome } from '../srs/reviewState';
import type { Difficulty, MiniGameConfig } from './miniGameConfig';
import { shuffle } from './shuffle';

/** The measure words of the nouns (DESIGN.md 5 ter, adapted from CC-CEDICT). */
export type MeasureWordTable = ReadonlyMap<string, readonly string[]>;

/** Before the gap: 一 __ 信封, 两 __ 朋友, 这 __ 书. Never 二 (GAME_DESIGN.md 6.11). */
export const DETERMINERS: readonly string[] = ['一', '两', '三', '这', '那'];

/**
 * Groups of meaning of the common measure words: a wrong option is never in the group of a
 * right one, so that a wrong choice is really wrong (GAME_DESIGN.md 6.11).
 */
export const MEASURE_WORD_GROUPS = {
  people: ['个', '位', '名', '口'],
  animals: ['只', '头', '匹', '条'],
  flat: ['张', '片', '块'],
  books: ['本', '册', '部'],
  clothes: ['件', '套', '条', '双'],
  vehicles: ['辆', '台', '部', '架'],
  buildings: ['座', '栋', '间'],
  long: ['条', '根', '支'],
  containers: ['杯', '瓶', '碗', '盒'],
  texts: ['篇', '首', '段', '封'],
  events: ['次', '场', '顿'],
} as const;

export type MeasureWordGroup = keyof typeof MEASURE_WORD_GROUPS;

/** Often tolerated in speech: never offered as a wrong option. */
const NEVER_WRONG = '个';
/** The most frequent measure words at school: the wrong options of level 3. */
const FREQUENT = ['本', '张', '条', '件', '只', '辆'];
/** The right option shown first, when the noun takes several. */
const PREFERRED = Array.from('个本张条件只辆位双杯台把家所门棵朵块封首篇');

export interface MeasureWordQuestion {
  target: Card;
  determiner: string;
  /** Every measure word of the table for this noun: any of them is right. */
  right: readonly string[];
  /** One right measure word and the wrong ones, in the order shown. */
  options: string[];
  difficulty: Difficulty;
}

export function measureWordsOf(card: Card, table: MeasureWordTable): readonly string[] {
  return card.language === 'zh' ? (table.get(card.term.trim()) ?? []) : [];
}

export function isMeasureWordEligible(card: Card, table: MeasureWordTable): boolean {
  return measureWordsOf(card, table).length > 0;
}

export function groupsOf(measureWord: string): MeasureWordGroup[] {
  return (Object.keys(MEASURE_WORD_GROUPS) as MeasureWordGroup[]).filter((group) =>
    (MEASURE_WORD_GROUPS[group] as readonly string[]).includes(measureWord),
  );
}

function shareAGroup(a: string, b: string): boolean {
  const theirs = groupsOf(b);
  return a === b || groupsOf(a).some((group) => theirs.includes(group));
}

/** A question on a noun of the table; undefined for any other word. */
export function measureWordQuestion(
  target: Card,
  table: MeasureWordTable,
  { level, seed }: { level: Difficulty; seed: string },
  config: Pick<MiniGameConfig, 'optionsByLevel'>,
): MeasureWordQuestion | undefined {
  const right = measureWordsOf(target, table);
  const shown = PREFERRED.find((one) => right.includes(one)) ?? right[0];
  if (shown === undefined) {
    return undefined;
  }
  const rng = createRng(seed);
  // Each determiner is one character: the first of a shuffled string is one of them.
  const determiner = shuffle(DETERMINERS, rng).join('').charAt(0);
  const allowed = [...new Set(Object.values(MEASURE_WORD_GROUPS).flat())].filter(
    (candidate) =>
      candidate !== NEVER_WRONG && !right.some((correct) => shareAGroup(candidate, correct)),
  );
  const wanted = config.optionsByLevel[level] - 1;
  const frequent = allowed.filter((candidate) => FREQUENT.includes(candidate));
  const drawn =
    level === 3 && frequent.length >= wanted ? shuffle(frequent, rng) : shuffle(allowed, rng);
  return {
    target,
    determiner,
    right,
    options: shuffle([shown, ...drawn.slice(0, wanted)], rng),
    difficulty: level,
  };
}

/** Right for any measure word of the table. No FSRS rating: the word itself is not tested. */
export function measureWordAnswer(question: MeasureWordQuestion, choice: string): Outcome {
  return question.right.includes(choice) ? 'correct' : 'wrong';
}
