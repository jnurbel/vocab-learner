import type { Card } from '../../domain/card';
import { buildPracticeQueue, PRACTICE_MODE } from '../../domain/srs/practiceQueue';
import type { StudyRepository } from '../../storage/studyRepository';
import {
  OUTCOME_OF,
  type AnswerOptions,
  type FlashcardSelection,
  type SelfEvaluation,
} from '../flashcards/flashcardSession';

export type PracticeStore = Pick<
  StudyRepository,
  'startSession' | 'recordPracticeAnswer' | 'endSession'
>;

export interface PracticeSessionDependencies {
  store: PracticeStore;
  clock: () => Date;
  newId: () => string;
}

export interface PracticeItem {
  card: Card;
  kind: 'practice';
}

/** "Je le connais déjà" belongs to the discovery of a new word, never to free practice. */
export type PracticeEvaluation = Exclude<SelfEvaluation, 'known'>;

export interface PracticeSummary {
  seen: number;
  /** Answered "Je savais". */
  known: number;
  /** Answered "À revoir" or "Difficile", in the order seen: the words to practise again. */
  toReview: Card[];
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
  private readonly evaluations: PracticeEvaluation[] = [];

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
    const item = this.current;
    if (item === undefined) {
      throw new Error('The session is finished');
    }
    const now = this.deps.clock();
    await this.ensureStarted(now);
    await this.deps.store.recordPracticeAnswer({
      sessionId: this.id,
      result: {
        cardId: item.card.id,
        outcome: OUTCOME_OF[evaluation],
        exercise: 'audioFlashcard',
        hintsUsed,
        at: now.toISOString(),
      },
    });
    this.evaluations.push(evaluation);
    this.index += 1;
    if (this.finished) {
      await this.end();
    }
  }

  /** Leaves early: the answers given are already stored. */
  async quit(): Promise<void> {
    this.left = true;
    await this.end();
  }

  summary(): PracticeSummary {
    return {
      seen: this.evaluations.length,
      known: this.evaluations.filter((evaluation) => evaluation === 'good').length,
      // The answers given are the first items of the queue, in order.
      toReview: this.items
        .slice(0, this.evaluations.length)
        .filter((_, index) => this.evaluations[index] !== 'good')
        .map(({ card }) => card),
    };
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
