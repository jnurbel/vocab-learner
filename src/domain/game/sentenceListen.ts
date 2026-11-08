import type { Card } from '../card';
import type { SrsConfig } from '../srs/config';
import type { Stage } from '../srs/reviewState';
import type { DistractorPool } from './distractors';
import {
  listenMeaningAnswer,
  listenMeaningQuestion,
  type AnswerDetails,
  type ListenMeaningResult,
} from './listenMeaning';
import type { Difficulty, MiniGameConfig } from './miniGameConfig';

/** Hear the example sentence of a word, then find the word heard (GAME_DESIGN.md 6.5). */
export interface SentenceListenQuestion {
  target: Card;
  sentence: string;
  /** The written words offered, the right one among them, in the order shown. */
  options: Card[];
  difficulty: Difficulty;
}

export interface SentenceQuestionSettings {
  level: Difficulty;
  stage: Stage;
  seed: string;
}

/** Longest sentence worth hearing at normal speed (GAME_DESIGN.md 6.5). */
const MAX_CHINESE_CHARS = 40;
const MAX_ENGLISH_WORDS = 25;
/** Simple English endings accepted: cat → cats, walk → walked, read → reading. */
const ENGLISH_ENDINGS = ['', 's', 'es', 'ed', 'd', 'ing'];
const WORD_CHARS = /[\p{L}\p{N}'’]/u;

/**
 * Whether the sentence holds the word: anywhere in Chinese; in English as a whole word, any case,
 * with a simple ending. The term is compared as text, never turned into a pattern.
 */
export function containsTerm(sentence: string, card: Card): boolean {
  const term = card.term.trim();
  if (term === '') {
    return false;
  }
  if (card.language === 'zh') {
    return sentence.includes(term);
  }
  const text = sentence.toLowerCase();
  const wanted = term.toLowerCase();
  for (let at = text.indexOf(wanted); at !== -1; at = text.indexOf(wanted, at + 1)) {
    const before = text.slice(at - 1, at);
    const rest = text.slice(at + wanted.length);
    const ending = ENGLISH_ENDINGS.find(
      (suffix) =>
        rest.startsWith(suffix) && !WORD_CHARS.test(rest.slice(suffix.length, suffix.length + 1)),
    );
    if ((before === '' || !WORD_CHARS.test(before)) && ending !== undefined) {
      return true;
    }
  }
  return false;
}

/** The example sentence of a word worth asking, or undefined. */
export function sentenceOf(card: Card): string | undefined {
  const sentence = card.example?.trim() ?? '';
  if (sentence === '' || !containsTerm(sentence, card)) {
    return undefined;
  }
  const short =
    card.language === 'zh'
      ? Array.from(sentence).length <= MAX_CHINESE_CHARS
      : sentence.split(/\s+/).length <= MAX_ENGLISH_WORDS;
  return short ? sentence : undefined;
}

export function isSentenceListenEligible(card: Card): boolean {
  return sentenceOf(card) !== undefined;
}

/**
 * A question on `target`: its sentence, and written words close by sound, never a word heard in
 * the sentence too (two right answers); undefined when not eligible or without another word.
 */
export function sentenceListenQuestion(
  target: Card,
  pool: DistractorPool,
  settings: SentenceQuestionSettings,
  config: MiniGameConfig,
): SentenceListenQuestion | undefined {
  const sentence = sentenceOf(target);
  if (sentence === undefined) {
    return undefined;
  }
  const cards = pool.cards.filter((card) => card === target || !containsTerm(sentence, card));
  const question = listenMeaningQuestion(target, { ...pool, cards }, settings, config);
  return question === undefined ? undefined : { ...question, sentence };
}

/** Rated as a choice, as ListenMeaning: right and quick is good, slow is hard, wrong is again. */
export function sentenceListenAnswer(
  question: SentenceListenQuestion,
  choice: Card | 'unknown',
  details: AnswerDetails,
  config: Pick<SrsConfig, 'choiceSlowMs'>,
): ListenMeaningResult {
  return listenMeaningAnswer(question, choice, details, config);
}
