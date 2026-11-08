import type { Card, Language } from '../card';
import type { Rng } from '../srs/random';
import type { Outcome } from '../srs/reviewState';
import { toneSegments, type Tone } from '../toneSyllables';
import { ENGLISH_MINIMAL_PAIRS } from './englishMinimalPairs';
import type { Difficulty } from './miniGameConfig';

/** A character of a word with its syllable, as written in the pinyin of the card. */
export interface WordSyllable {
  char: string;
  /** The syllable with its tone mark, e.g. shí. */
  syllable: string;
  tone: Tone;
}

/** Level 1: a syllable heard alone, its tone to find (GAME_DESIGN.md 6.3). */
export interface ToneItem {
  kind: 'tone';
  card: Card;
  /** What is read aloud: the character alone, which gives the syllable its citation tone. */
  char: string;
  syllable: string;
  tone: 1 | 2 | 3 | 4;
}

/** Level 2: a word of two syllables, its tones to type, e.g. 34. */
export interface PatternItem {
  kind: 'pattern';
  card: Card;
  /** The citation tones, the neutral tone written 5: 你好 is 33, though heard 23. */
  pattern: string;
  syllables: WordSyllable[];
}

/** One of the two words of a minimal pair. */
export interface PairSide {
  /** What is read aloud: the hanzi, or the English word. */
  text: string;
  /** What the button shows: the pinyin with its tones, or the English word. */
  display: string;
  language: Language;
  /** The learner's word, when it is one: its answers are stored for the path. */
  card?: Card;
}

/** Level 3 in Chinese, every level in English: hear one of two close words, tell which. */
export interface PairItem {
  kind: 'pair';
  sides: [PairSide, PairSide];
  level: Difficulty;
}

/** Their tone changes with the next syllable: never asked on their own (GAME_DESIGN.md 6.3). */
const SANDHI_CHARS = new Set(['一', '不']);

/**
 * Common characters read with another tone, or another sound, alone than in many words: a
 * syllable of theirs read alone could contradict the word. A short list written for this app.
 */
const READ_DIFFERENTLY_ALONE = new Set(
  Array.from('了的得地着行长好还为都便重朝和乐觉教要只种数没当正发分'),
);

const NEUTRAL_DIGIT = '5';
const MAX_PATTERN_LENGTH = 2;

/** The syllables of a Chinese word, one per character; empty when they do not line up. */
export function wordSyllables(card: Card): WordSyllable[] {
  if (card.language !== 'zh') {
    return [];
  }
  const chars = Array.from(card.term);
  const syllables = toneSegments(card.pinyin ?? '').filter(
    (segment): segment is { text: string; tone: Tone } => segment.tone !== undefined,
  );
  if (syllables.length === 0 || syllables.length !== chars.length) {
    return [];
  }
  return syllables.map(({ text, tone }, index) => ({
    char: chars.slice(index, index + 1).join(''),
    syllable: text,
    tone,
  }));
}

/** Level 1 items: every syllable that keeps its tone when its character is read alone. */
export function toneSyllableItems(cards: readonly Card[]): ToneItem[] {
  return cards.flatMap((card) =>
    wordSyllables(card).flatMap(({ char, syllable, tone }) =>
      tone === 'neutral' || SANDHI_CHARS.has(char) || READ_DIFFERENTLY_ALONE.has(char)
        ? []
        : [{ kind: 'tone' as const, card, char, syllable, tone }],
    ),
  );
}

/** A level 2 item on a word of two syllables without 一 nor 不; undefined otherwise. */
export function tonePatternItem(card: Card): PatternItem | undefined {
  const syllables = wordSyllables(card);
  if (syllables.length !== 2 || syllables.some(({ char }) => SANDHI_CHARS.has(char))) {
    return undefined;
  }
  const pattern = syllables
    .map(({ tone }) => (tone === 'neutral' ? NEUTRAL_DIGIT : String(tone)))
    .join('');
  return { kind: 'pattern', card, pattern, syllables };
}

/** The tones heard: a third tone before another third tone is said as a second (sandhi). */
export function spokenTonePattern(pattern: string): string {
  return pattern.replace(/3(?=3)/g, '2');
}

/** A typed pattern made safe to compare: tone digits only, 0 read as the neutral tone. */
export function normalizeTonePattern(input: string): string {
  return Array.from(input.slice(0, 100))
    .filter((char) => /^[0-5]$/.test(char))
    .map((digit) => (digit === '0' ? NEUTRAL_DIGIT : digit))
    .slice(0, MAX_PATTERN_LENGTH)
    .join('');
}

const TONE_MARKS = /[̄́̌̀]/g;

/** The pinyin without tones nor spaces, to find words that differ by their tones only. */
function tonelessKey(pinyin: string): string {
  return pinyin
    .normalize('NFD')
    .replace(TONE_MARKS, '')
    .replace(/[\s'’-]/g, '')
    .toLowerCase();
}

function tonedKey(pinyin: string): string {
  return pinyin
    .normalize('NFC')
    .replace(/[\s'’-]/g, '')
    .toLowerCase();
}

function chineseSide({ card, pinyin }: { card: Card; pinyin: string }): PairSide {
  return { text: card.term, display: pinyin, language: 'zh', card };
}

/**
 * Pairs of the learner's Chinese words with the same syllables but other tones (shíjiān /
 * shìjiàn). No table of characters is embedded while its licence is unchecked: without such a
 * pair, level 3 is skipped (GAME_DESIGN.md 12, point 16).
 */
export function chinesePairItems(cards: readonly Card[]): PairItem[] {
  const toned = cards.flatMap((card) => {
    const pinyin = card.pinyin ?? '';
    const toneless = tonelessKey(pinyin);
    return card.language === 'zh' && toneless !== ''
      ? [{ card, pinyin, toneless, toned: tonedKey(pinyin) }]
      : [];
  });
  return toned.flatMap((first, index) =>
    toned
      .slice(index + 1)
      .filter(
        (second) =>
          second.card.term !== first.card.term &&
          second.toneless === first.toneless &&
          second.toned !== first.toned,
      )
      .map((second) => ({
        kind: 'pair' as const,
        level: 3 as const,
        sides: [chineseSide(first), chineseSide(second)] as [PairSide, PairSide],
      })),
  );
}

/** Every English pair of our list, linked to the learner's words found in it. */
export function englishPairItems(cards: readonly Card[]): PairItem[] {
  const byTerm = new Map(
    cards
      .filter((card) => card.language === 'en')
      .map((card) => [card.term.trim().toLowerCase(), card] as const),
  );
  const side = (text: string): PairSide => {
    const card = byTerm.get(text);
    return { text, display: text, language: 'en', ...(card === undefined ? {} : { card }) };
  };
  return ENGLISH_MINIMAL_PAIRS.map(({ words: [first, second], level }) => ({
    kind: 'pair' as const,
    level,
    sides: [side(first), side(second)] as [PairSide, PairSide],
  }));
}

/** What a round draws its questions from, per kind. */
export interface ToneEchoPool {
  tones: ToneItem[];
  patterns: PatternItem[];
  pairs: PairItem[];
}

/** A question: an item, and for a pair the side read aloud. */
export type ToneEchoQuestion = ToneItem | PatternItem | (PairItem & { heard: 0 | 1 });

/**
 * The items of a language, from the learner's words; with imposed words, only the items of
 * those words (a pair counts when either of its words is imposed).
 */
export function toneEchoPool(
  cards: readonly Card[],
  language: Language,
  cardIds?: readonly string[],
): ToneEchoPool {
  const ofLanguage = cards.filter((card) => card.language === language);
  const imposed = cardIds === undefined ? undefined : new Set(cardIds);
  const kept = (card: Card | undefined) =>
    imposed === undefined || (card !== undefined && imposed.has(card.id));
  const asked = ofLanguage.filter((card) => kept(card));
  if (language === 'en') {
    const pairs = englishPairItems(ofLanguage);
    return {
      tones: [],
      patterns: [],
      pairs:
        imposed === undefined
          ? pairs
          : pairs.filter(({ sides }) => sides.some(({ card }) => kept(card))),
    };
  }
  return {
    tones: toneSyllableItems(asked),
    patterns: asked.flatMap((card) => {
      const item = tonePatternItem(card);
      return item === undefined ? [] : [item];
    }),
    pairs: chinesePairItems(ofLanguage).filter(({ sides }) => sides.some(({ card }) => kept(card))),
  };
}

/** Identifies an item, so that a round asks another one before asking it again. */
export function questionKey(item: ToneItem | PatternItem | PairItem): string {
  switch (item.kind) {
    case 'tone':
      return item.char;
    case 'pattern':
      return item.card.term;
    case 'pair':
      return item.sides.map(({ text }) => text).join('|');
  }
}

/**
 * The next question at a level (GAME_DESIGN.md 6.3): in Chinese, a pair at level 3, a tone
 * pattern at level 2, a tone at level 1, each falling back on the next kind when the words
 * offer none; in English, a pair of the level, those holding a learner's word first.
 */
export function pickToneEchoQuestion(
  pool: ToneEchoPool,
  level: Difficulty,
  rng: Rng,
  asked: ReadonlySet<string>,
): ToneEchoQuestion | undefined {
  const kinds: readonly (readonly (ToneItem | PatternItem | PairItem)[])[] =
    pool.tones.length === 0 && pool.patterns.length === 0
      ? englishChoices(pool.pairs, level)
      : [level === 3 ? pool.pairs : [], level >= 2 ? pool.patterns : [], pool.tones];
  const items = kinds.find((choices) => choices.length > 0);
  if (items === undefined) {
    return undefined;
  }
  const fresh = items.filter((item) => !asked.has(questionKey(item)));
  const from = fresh.length > 0 ? fresh : items;
  const index = Math.floor(rng() * from.length);
  const [question] = from
    .slice(index, index + 1)
    .map((item): ToneEchoQuestion =>
      item.kind === 'pair' ? { ...item, heard: rng() < 0.5 ? 0 : 1 } : item,
    );
  return question;
}

function englishChoices(pairs: readonly PairItem[], level: Difficulty): PairItem[][] {
  const linked = (pair: PairItem) => pair.sides.some(({ card }) => card !== undefined);
  const ofLevel = pairs.filter((pair) => pair.level === level);
  return [ofLevel.filter(linked), pairs.filter(linked), ofLevel];
}

/** Right or wrong: a tone 1 to 5 (5 neutral), a typed pattern, or the side of the pair (0 or 1). */
export function toneEchoAnswer(question: ToneEchoQuestion, given: number | string): Outcome {
  switch (question.kind) {
    case 'tone':
      return given === question.tone ? 'correct' : 'wrong';
    case 'pattern':
      return normalizeTonePattern(String(given)) === question.pattern ? 'correct' : 'wrong';
    case 'pair':
      return given === question.heard ? 'correct' : 'wrong';
  }
}

/** The learner's word an answer is stored for; none for a pair of our list only. */
export function questionCard(question: ToneEchoQuestion): Card | undefined {
  if (question.kind !== 'pair') {
    return question.card;
  }
  const other = question.heard === 0 ? 1 : 0;
  return question.sides[question.heard].card ?? question.sides[other].card;
}

/** The words of a language that ToneEcho can ask, for the list of mini-games and the path. */
export function toneEchoEligibleCount(cards: readonly Card[], language: Language): number {
  const pool = toneEchoPool(cards, language);
  const ids = new Set([
    ...pool.tones.map(({ card }) => card.id),
    ...pool.patterns.map(({ card }) => card.id),
    ...pool.pairs.flatMap(({ sides }) =>
      sides.flatMap(({ card }) => (card === undefined ? [] : [card.id])),
    ),
  ]);
  return ids.size;
}

/** The pitch of a tone on the five levels of Chao's scale: 5 high, 1 low. */
export function toneContour(tone: Tone): number[] {
  switch (tone) {
    case 1:
      return [5, 5];
    case 2:
      return [3, 5];
    case 3:
      return [2, 1, 4];
    case 4:
      return [5, 1];
    case 'neutral':
      return [3];
  }
}

export interface ContourBox {
  width: number;
  height: number;
  margin: number;
}

/** An SVG path of the tone's curve in a box; a neutral tone is a dot in the middle. */
export function contourPath(tone: Tone, { width, height, margin }: ContourBox): string {
  const levels = toneContour(tone);
  const step = (height - 2 * margin) / 4;
  const [left, right] = [2 * margin, width - 2 * margin];
  const y = (level: number) => margin + (5 - level) * step;
  const middle = (left + right) / 2;
  const points =
    levels.length === 1
      ? levels.flatMap((level) => [
          [middle, y(level)],
          [middle, y(level)],
        ])
      : levels.map((level, index) => [
          left + ((right - left) * index) / (levels.length - 1),
          y(level),
        ]);
  return points
    .map(([x, top], index) => `${index === 0 ? 'M' : 'L'}${String(x)} ${String(top)}`)
    .join(' ');
}
