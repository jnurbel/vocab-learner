import type { Card, Language } from '../card';
import type { SrsConfig } from '../srs/config';
import { createRng, type Rng } from '../srs/random';
import { ratingFor } from '../srs/rating';
import type { Outcome, Rating, ReviewState, Stage } from '../srs/reviewState';
import { difficultyFor } from './adaptiveDifficulty';
import { pickDistractors, type DistractorPool } from './distractors';
import type { Difficulty, MiniGameConfig } from './miniGameConfig';

/** Hear a word, then choose its meaning (GAME_DESIGN.md 6.1). */
export interface ListenMeaningQuestion {
  target: Card;
  /** The right word and its distractors, in the order shown; their meanings are the options. */
  options: Card[];
  difficulty: Difficulty;
}

export interface QuestionSettings {
  /** The adaptive level of the game in this language. */
  level: Difficulty;
  /** The current stage of the word asked: a young word is never asked at the hardest level. */
  stage: Stage;
  seed: string;
}

export interface RoundSettings {
  seed: string;
  size: number;
}

export interface AnswerDetails {
  /** 1 when the written word (hanzi or letters) was shown. */
  hintsUsed: number;
  responseMs: number;
}

export interface ListenMeaningResult {
  outcome: Outcome;
  rating: Rating;
}

/** The words of a round: those already introduced, or every word when too few are. */
export function listenMeaningRound(
  cards: readonly Card[],
  states: readonly ReviewState[],
  language: Language,
  { seed, size }: RoundSettings,
): Card[] {
  const introduced = new Set(states.filter(({ reps }) => reps > 0).map(({ cardId }) => cardId));
  const ofLanguage = cards.filter((card) => card.language === language);
  const known = ofLanguage.filter(({ id }) => introduced.has(id));
  return shuffle(known.length >= 2 ? known : ofLanguage, createRng(seed)).slice(0, size);
}

/** A question on `target`, or undefined when no other word can be offered. */
export function listenMeaningQuestion(
  target: Card,
  pool: DistractorPool,
  { level, stage, seed }: QuestionSettings,
  config: MiniGameConfig,
): ListenMeaningQuestion | undefined {
  const difficulty = difficultyFor(level, stage, config);
  const rng = createRng(seed);
  const distractors = pickDistractors(target, pool, difficulty, rng, config);
  if (distractors === undefined) {
    return undefined;
  }
  return { target, options: shuffle([target, ...distractors], rng), difficulty };
}

/**
 * The outcome and FSRS rating of a choice: a choice exercise, so a right answer given after
 * 8 seconds is rated hard (GAME_DESIGN.md 1.2). "Je ne sais pas" is a wrong answer.
 */
export function listenMeaningAnswer(
  question: ListenMeaningQuestion,
  choice: Card | 'unknown',
  { hintsUsed, responseMs }: AnswerDetails,
  config: Pick<SrsConfig, 'choiceSlowMs'>,
): ListenMeaningResult {
  if (choice !== 'unknown' && !question.options.includes(choice)) {
    throw new Error('Not an option of this question');
  }
  const right = choice !== 'unknown' && choice.id === question.target.id;
  const outcome: Outcome = !right ? 'wrong' : hintsUsed > 0 ? 'correctWithHint' : 'correct';
  return {
    outcome,
    rating: ratingFor(outcome, { exercise: 'choice', responseMs, hintsUsed }, config),
  };
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other] as T, shuffled[index] as T];
  }
  return shuffled;
}
