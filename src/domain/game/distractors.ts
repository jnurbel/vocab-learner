import type { Card } from '../card';
import { editDistance } from '../dictation/characterDiff';
import { SENSE_SEPARATOR } from '../meaning/senses';
import type { Rng } from '../srs/random';
import { toneSegments } from '../toneSyllables';
import type { Difficulty, MiniGameConfig } from './miniGameConfig';

/** The words a question may draw its distractors from. */
export interface DistractorPool {
  cards: readonly Card[];
  /** Ids of the words already introduced (reps >= 1): preferred, they are known by sight. */
  introduced: ReadonlySet<string>;
}

type DistractorConfig = Pick<
  MiniGameConfig,
  'optionsByLevel' | 'minOptions' | 'similarityWeights' | 'englishHomophones'
>;

/** Leading articles and particles that never make a meaning different (GAME_DESIGN.md 6.0). */
const LEADING_ARTICLE = /^(?:de la |l'|s'|(?:le|la|les|un|une|des|du|se|to) )/;
const COMBINING_MARKS = /\p{Mn}/gu;
const TONE_MARKS = /[̄́̌̀]/g;
const INITIAL = /^(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/;

/** The plain meanings of a translation: no case, accents, parentheses nor leading article. */
export function glosses(translation: string): string[] {
  return translation
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/’/g, "'")
    .replace(/\([^)]*\)/g, ' ')
    .split(SENSE_SEPARATOR)
    .map((piece) => piece.trim().replace(LEADING_ARTICLE, '').trim())
    .filter((piece) => piece !== '');
}

/** Two meanings sharing a gloss would make two right answers. */
export function meaningsConflict(a: string, b: string): boolean {
  const theirs = new Set(glosses(b));
  return glosses(a).some((gloss) => theirs.has(gloss));
}

/** Words that must never be offered as a distractor of `target` in an audio question. */
export function isExcluded(target: Card, candidate: Card, config: DistractorConfig): boolean {
  return (
    target.term.toLowerCase() === candidate.term.toLowerCase() ||
    meaningsConflict(target.translation, candidate.translation) ||
    areHomophones(target, candidate, config)
  );
}

function areHomophones(a: Card, b: Card, config: DistractorConfig): boolean {
  if (a.language === 'zh') {
    const pinyin = tonedPinyin(a);
    return pinyin !== '' && pinyin === tonedPinyin(b);
  }
  const [left, right] = [a.term.toLowerCase(), b.term.toLowerCase()];
  return config.englishHomophones.some((group) => group.includes(left) && group.includes(right));
}

function tonedPinyin(card: Card): string {
  return (card.pinyin ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\s'’-]/g, '');
}

/** Sound proximity of two words: the higher, the harder to tell apart by ear. */
export function similarity(target: Card, candidate: Card, config: DistractorConfig): number {
  const sharedLabel = target.labelIds.some((id) => candidate.labelIds.includes(id));
  if (target.language === 'zh') {
    const weights = config.similarityWeights.zh;
    return chineseSimilarity(target, candidate, weights) + (sharedLabel ? weights.sharedLabel : 0);
  }
  const weights = config.similarityWeights.en;
  return englishSimilarity(target, candidate, weights) + (sharedLabel ? weights.sharedLabel : 0);
}

interface Syllable {
  toneless: string;
  tone: string;
  initial: string;
  final: string;
}

function syllablesOf(card: Card): Syllable[] {
  return toneSegments(card.pinyin ?? '').flatMap(({ text, tone }) => {
    if (tone === undefined) {
      return [];
    }
    const toneless = text.toLowerCase().normalize('NFD').replace(TONE_MARKS, '').normalize('NFC');
    const initial = INITIAL.exec(toneless)?.[0] ?? '';
    return [{ toneless, tone: String(tone), initial, final: toneless.slice(initial.length) }];
  });
}

function chineseSimilarity(
  target: Card,
  candidate: Card,
  weights: MiniGameConfig['similarityWeights']['zh'],
): number {
  const [targetChars, candidateChars] = [Array.from(target.term), Array.from(candidate.term)];
  const shared = new Set(targetChars.filter((char) => candidateChars.includes(char))).size;
  let score = targetChars.length === candidateChars.length ? weights.sameLength : 0;
  score += Math.min(shared, weights.sharedCharMax) * weights.sharedChar;

  const [ours, theirs] = [syllablesOf(target), syllablesOf(candidate)];
  ours.forEach((syllable, position) => {
    const other = theirs[position];
    if (other === undefined) {
      return;
    }
    score += syllable.toneless === other.toneless ? weights.sameSyllableToneless : 0;
    score +=
      syllable.initial !== '' && syllable.initial === other.initial
        ? weights.sameInitialOrFinal
        : 0;
    score +=
      syllable.final !== '' && syllable.final === other.final ? weights.sameInitialOrFinal : 0;
  });
  const tones = (syllables: Syllable[]) => syllables.map(({ tone }) => tone).join('-');
  if (ours.length > 0 && tones(ours) === tones(theirs)) {
    score += weights.sameTonePattern;
  }
  return score;
}

function englishSimilarity(
  target: Card,
  candidate: Card,
  weights: MiniGameConfig['similarityWeights']['en'],
): number {
  const [a, b] = [target.term.toLowerCase(), candidate.term.toLowerCase()];
  const distance = editDistance(a, b);
  let score = Math.abs(a.length - b.length) <= 1 ? weights.lengthWithin1 : 0;
  score += distance <= 2 ? weights.levenshteinLe2 : distance === 3 ? weights.levenshteinEq3 : 0;
  score += a.slice(0, 2) === b.slice(0, 2) ? weights.samePrefix2 : 0;
  score += a.length >= 3 && a.slice(-3) === b.slice(-3) ? weights.sameSuffix3 : 0;
  return score;
}

/**
 * Picks the distractors of a question (GAME_DESIGN.md 6.0): level 1 draws among the least similar
 * half, level 2 takes one among the 3 closest, level 3 draws among the 2k closest. With too few
 * words, fewer options; with none, the question is not eligible (undefined).
 */
export function pickDistractors(
  target: Card,
  pool: DistractorPool,
  difficulty: Difficulty,
  rng: Rng,
  config: DistractorConfig,
): Card[] | undefined {
  const allowed = pool.cards.filter(
    (card) =>
      card.id !== target.id &&
      card.language === target.language &&
      !isExcluded(target, card, config),
  );
  const wanted = config.optionsByLevel[difficulty] - 1;
  const introduced = allowed.filter(({ id }) => pool.introduced.has(id));
  const candidates = introduced.length >= wanted ? introduced : allowed;
  if (candidates.length + 1 < config.minOptions) {
    return undefined;
  }
  const count = Math.min(wanted, candidates.length);
  const ranked = candidates
    .map((card) => ({ card, score: similarity(target, card, config) }))
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))
    .map(({ card }) => card);

  if (difficulty === 1) {
    return draw(ranked.slice(Math.floor(ranked.length / 2)), count, rng, ranked);
  }
  if (difficulty === 3) {
    return draw(ranked.slice(0, 2 * count), count, rng, ranked);
  }
  const [close] = draw(ranked.slice(0, 3), 1, rng, ranked);
  const rest = ranked.filter((card) => card !== close);
  return [close, ...draw(rest, count - 1, rng, rest)].filter((card) => card !== undefined);
}

/** Draws `count` different cards from `from`, completing from `fallback` if `from` is short. */
function draw(from: readonly Card[], count: number, rng: Rng, fallback: readonly Card[]): Card[] {
  const left = [...from];
  const picked: Card[] = [];
  while (picked.length < count && left.length > 0) {
    picked.push(...left.splice(Math.floor(rng() * left.length), 1));
  }
  const extra = fallback.filter((card) => !picked.includes(card));
  return [...picked, ...extra.slice(0, count - picked.length)];
}
