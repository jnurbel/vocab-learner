import type { Card } from '../../domain/card';
import { cleanAnswer } from '../../domain/dictation/answerText';
import { answerEvents } from '../../domain/game/answerEvents';
import type { ExerciseType, SessionResultRecord } from '../../domain/progressRecords';
import { assertAcceptable } from '../../domain/srs/acceptAnswer';
import type { Outcome } from '../../domain/srs/reviewState';
import { GAME_CONFIG } from '../../domain/srs/config';
import { localDay, type LocalDay } from '../../domain/srs/localDay';
import { buildPracticeQueue, PRACTICE_MODE } from '../../domain/srs/practiceQueue';
import type { StudyRepository } from '../../storage/studyRepository';
import {
  OUTCOME_OF,
  RECORDED_EXERCISE,
  type AnswerOptions,
  type FlashcardSelection,
  type SelfEvaluation,
  type TypedAnswerOptions,
  type TypedExercise,
} from '../flashcards/flashcardSession';
import { SessionRewards, type RewardsSummary } from '../game/sessionRewards';

export type PracticeStore = Pick<
  StudyRepository,
  'startSession' | 'recordPracticeAnswer' | 'revisePracticeAnswer' | 'endSession'
>;

export interface PracticeSessionDependencies {
  store: PracticeStore;
  clock: () => Date;
  newId: () => string;
  /** The learner's day of an answer, for its points; the device's local day by default. */
  dayOf?: (now: Date) => LocalDay;
}

export interface PracticeItem {
  card: Card;
  kind: 'practice';
}

/** "Je le connais déjà" belongs to the discovery of a new word, never to free practice. */
export type PracticeEvaluation = Exclude<SelfEvaluation, 'known'>;

export interface PracticeSummary {
  seen: number;
  /** Answered "Je savais", or typed right without a hint. */
  known: number;
  /** Every other answer, in the order seen: the words to practise again. */
  toReview: Card[];
}

/** "Je savais", or a right answer typed without a hint. */
function isKnown(result: SessionResultRecord | undefined): boolean {
  return result?.outcome === 'correct';
}

/** Starts a free practice on every word of the selection. */
export function startPracticeSession(
  selection: FlashcardSelection,
  deps: PracticeSessionDependencies,
): PracticeSession {
  const id = deps.newId();
  const cards = buildPracticeQueue({
    cards: selection.cards,
    language: selection.language,
    labelIds: selection.labelIds,
    seed: id,
  });
  return new PracticeSession(
    id,
    cards.map((card) => ({ card, kind: 'practice' })),
    selection,
    deps,
  );
}

/**
 * One pass through every chosen word. The answers are kept for the history only: they never
 * update the memory model, even for a word not rated today (DESIGN.md, 0.4.0).
 */
export class PracticeSession {
  private index = 0;
  private started = false;
  private left = false;
  /** The results stored, in the order of the queue. */
  private readonly results: SessionResultRecord[] = [];
  /** Set when the last answer was a typed meaning, which "J'avais bon" may accept. */
  private lastTyped: TypedExercise | undefined;
  /** Free practice earns points, but never counts for the streak (DESIGN.md 5 bis). */
  private readonly gameRewards = new SessionRewards();

  constructor(
    readonly id: string,
    readonly items: readonly PracticeItem[],
    private readonly selection: FlashcardSelection,
    private readonly deps: PracticeSessionDependencies,
  ) {}

  get current(): PracticeItem | undefined {
    return this.left ? undefined : this.items[this.index];
  }

  get position(): number {
    return this.index;
  }

  get total(): number {
    return this.items.length;
  }

  get finished(): boolean {
    return this.current === undefined;
  }

  async answer(
    evaluation: PracticeEvaluation,
    { hintsUsed = 0 }: AnswerOptions = {},
  ): Promise<void> {
    await this.record(OUTCOME_OF[evaluation], 'audioFlashcard', hintsUsed);
    this.lastTyped = undefined;
  }

  /** A typed answer, checked by the caller, kept for the history only. */
  async answerTyped(
    typed: TypedExercise,
    outcome: Outcome,
    { hintsUsed = 0, answer }: TypedAnswerOptions = {},
  ): Promise<void> {
    await this.record(outcome, RECORDED_EXERCISE[typed], hintsUsed, answer);
    this.lastTyped = typed;
  }

  /** "J'avais bon": the last typed meaning was right after all; its result is replaced. */
  async acceptLastAnswer(): Promise<void> {
    const last = this.results.at(-1);
    if (last === undefined || this.lastTyped !== 'typeMeaning') {
      throw new Error('Only a typed meaning can be accepted');
    }
    assertAcceptable(last);
    const result: SessionResultRecord = { ...last, outcome: 'correct' };
    await this.deps.store.revisePracticeAnswer({ sessionId: this.id, result });
    this.results.splice(-1, 1, result);
  }

  /** Leaves early: the answers given are already stored. */
  async quit(): Promise<void> {
    this.left = true;
    await this.end();
  }

  /** What the practice brought to the game; nothing before the first saved answer. */
  rewards(): RewardsSummary | undefined {
    return this.gameRewards.summary();
  }

  summary(): PracticeSummary {
    return {
      seen: this.results.length,
      known: this.results.filter(isKnown).length,
      // The answers given are the first items of the queue, in order.
      toReview: this.items
        .slice(0, this.results.length)
        .filter((_, index) => !isKnown(this.results[index]))
        .map(({ card }) => card),
    };
  }

  private async record(
    outcome: Outcome,
    exercise: ExerciseType,
    hintsUsed: number,
    answer?: string,
  ): Promise<void> {
    const item = this.current;
    if (item === undefined) {
      throw new Error('The session is finished');
    }
    const now = this.deps.clock();
    const result: SessionResultRecord = {
      cardId: item.card.id,
      outcome,
      exercise,
      hintsUsed,
      ...(answer === undefined ? {} : { answer: cleanAnswer(answer) }),
      at: now.toISOString(),
    };
    const { dayOf = (at: Date) => localDay(at, GAME_CONFIG.dayStartHour) } = this.deps;
    const events = answerEvents(
      {
        cardId: item.card.id,
        language: item.card.language,
        exercise,
        outcome,
        rated: false,
        sessionKind: 'free',
      },
      GAME_CONFIG,
    );
    await this.ensureStarted(now);
    await this.deps.store.recordPracticeAnswer({
      sessionId: this.id,
      result,
      progress: this.gameRewards.update(events, dayOf(now)),
    });
    this.gameRewards.confirm();
    this.results.push(result);
    this.index += 1;
    if (this.finished) {
      await this.end();
    }
  }

  /** The session is stored with its first answer, so that opening and leaving stores nothing. */
  private async ensureStarted(now: Date): Promise<void> {
    if (this.started) {
      return;
    }
    await this.deps.store.startSession({
      id: this.id,
      language: this.selection.language,
      labelIds: [...this.selection.labelIds],
      mode: PRACTICE_MODE,
      startedAt: now.toISOString(),
      results: [],
    });
    this.started = true;
  }

  private async end(): Promise<void> {
    if (this.started) {
      await this.deps.store.endSession(this.id, this.deps.clock().toISOString());
    }
  }
}
