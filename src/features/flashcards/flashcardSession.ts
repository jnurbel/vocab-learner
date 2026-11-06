import type { Card, Language } from '../../domain/card';
import type { SessionResultRecord } from '../../domain/progressRecords';
import { applyAnswer } from '../../domain/srs/applyAnswer';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import type { LocalDay } from '../../domain/srs/localDay';
import { countNewWordsIntroduced } from '../../domain/srs/newWordsToday';
import { ratingFor } from '../../domain/srs/rating';
import { buildReviewQueue, type ReviewQueueItem } from '../../domain/srs/reviewQueue';
import type { Outcome, Stage } from '../../domain/srs/reviewState';
import { stageOf } from '../../domain/srs/stage';
import { studyDay } from '../../domain/srs/studyDay';
import { newPerDayOf } from '../../domain/studySettings';
import type { StudyRepository } from '../../storage/studyRepository';

/** The self-evaluation buttons: "À revoir", "Difficile", "Je savais", "Je le connais déjà". */
export type SelfEvaluation = 'again' | 'hard' | 'good' | 'known';

export const OUTCOME_OF: Readonly<Record<SelfEvaluation, Outcome>> = {
  again: 'wrong',
  hard: 'correctWithHint',
  good: 'correct',
  known: 'correct',
};

/** Sessions started this long ago may still hold answers of today. */
const RECENT_SESSIONS_MS = 2 * 24 * 60 * 60 * 1000;

export type FlashcardStore = Pick<
  StudyRepository,
  'load' | 'startSession' | 'recordAnswer' | 'endSession'
>;

export interface FlashcardSessionDependencies {
  store: FlashcardStore;
  srs: SrsDependencies;
  clock: () => Date;
  newId: () => string;
}

export interface FlashcardSelection {
  cards: readonly Card[];
  language: Language;
  /** Empty: every word of the language. */
  labelIds: readonly string[];
}

export interface StageChange {
  card: Card;
  from: Stage;
  to: Stage;
}

export interface SessionSummary {
  reviewed: number;
  introduced: number;
  stageChanges: StageChange[];
}

export interface AnswerOptions {
  /** 1 when the pinyin was revealed. */
  hintsUsed?: number;
}

/** Starts today's flashcards: the day and the queue are fixed now, for the whole session. */
export async function startFlashcardSession(
  selection: FlashcardSelection,
  deps: FlashcardSessionDependencies,
): Promise<FlashcardSession> {
  const now = deps.clock();
  const since = new Date(now.getTime() - RECENT_SESSIONS_MS).toISOString();
  const data = await deps.store.load(since);
  const today = studyDay(now, data.progress?.lastActiveDate, deps.srs);
  const id = deps.newId();
  const items = buildReviewQueue(
    {
      cards: selection.cards,
      states: data.reviewStates,
      now,
      today,
      newPerDay: newPerDayOf(data.settings),
      newIntroducedToday: countNewWordsIntroduced(data.recentSessions, today, deps.srs),
      language: selection.language,
      labelIds: selection.labelIds,
      seed: id,
    },
    deps.srs,
  );
  return new FlashcardSession(id, today, items, selection, deps);
}

/** One pass through the queue; every answer is stored as soon as it is given. */
export class FlashcardSession {
  private index = 0;
  private started = false;
  private left = false;
  private readonly changes: StageChange[] = [];
  private readonly answeredKinds: ReviewQueueItem['kind'][] = [];

  constructor(
    readonly id: string,
    readonly today: LocalDay,
    readonly items: readonly ReviewQueueItem[],
    private readonly selection: FlashcardSelection,
    private readonly deps: FlashcardSessionDependencies,
  ) {}

  get current(): ReviewQueueItem | undefined {
    return this.left ? undefined : this.items[this.index];
  }

  /** Number of cards answered so far. */
  get position(): number {
    return this.index;
  }

  get total(): number {
    return this.items.length;
  }

  get finished(): boolean {
    return this.current === undefined;
  }

  async answer(evaluation: SelfEvaluation, { hintsUsed = 0 }: AnswerOptions = {}): Promise<void> {
    const item = this.current;
    if (item === undefined) {
      throw new Error('The session is finished');
    }
    const knownAlready = evaluation === 'known';
    if (knownAlready && item.kind !== 'new') {
      throw new Error('"I already know it" is only for a new word');
    }
    const { store, srs, clock } = this.deps;
    const now = clock();
    const outcome = OUTCOME_OF[evaluation];
    // A self-evaluation is not timed: it is rated like a typed answer.
    const rating = ratingFor(
      outcome,
      { exercise: 'typed', responseMs: 0, hintsUsed, knownAlready },
      srs.config,
    );
    const { state } = applyAnswer(item.state, rating, { now, today: this.today }, srs);
    const result: SessionResultRecord = {
      cardId: item.card.id,
      outcome,
      exercise: item.kind === 'new' ? 'discovery' : 'audioFlashcard',
      rating,
      hintsUsed,
      at: now.toISOString(),
    };
    await this.ensureStarted(now);
    await store.recordAnswer({ sessionId: this.id, state, result, activeDay: this.today });

    this.answeredKinds.push(item.kind);
    const from = stageOf(item.state, srs.config);
    const to = stageOf(state, srs.config);
    if (from !== to) {
      this.changes.push({ card: item.card, from, to });
    }
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

  summary(): SessionSummary {
    return {
      reviewed: this.answeredKinds.filter((kind) => kind === 'review').length,
      introduced: this.answeredKinds.filter((kind) => kind === 'new').length,
      stageChanges: [...this.changes],
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
      mode: 'flashcards',
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
