import type { Card, Language } from '../../domain/card';
import type { AnswerExercise } from '../../domain/answerExercise';
import { cleanAnswer } from '../../domain/dictation/answerText';
import { answerEvents } from '../../domain/game/answerEvents';
import type { ExerciseType, SessionResultRecord } from '../../domain/progressRecords';
import { acceptAsCorrect, type GivenAnswer } from '../../domain/srs/acceptAnswer';
import { applyAnswer } from '../../domain/srs/applyAnswer';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import type { LocalDay } from '../../domain/srs/localDay';
import { countNewWordsIntroduced } from '../../domain/srs/newWordsToday';
import { ratingFor } from '../../domain/srs/rating';
import { buildReviewQueue, type ReviewQueueItem } from '../../domain/srs/reviewQueue';
import type { Outcome, ReviewState, Stage } from '../../domain/srs/reviewState';
import { stageOf } from '../../domain/srs/stage';
import { studyDay } from '../../domain/srs/studyDay';
import { summarizeStudyOutlook, type StudyOutlook } from '../../domain/srs/studyOutlook';
import { newPerDayOf } from '../../domain/studySettings';
import type { StudyRepository } from '../../storage/studyRepository';
import { EXAM_CONFIG } from '../../domain/exam/examConfig';
import type { FocusPlanning } from '../../domain/exam/focusPlan';
import type { Label } from '../../domain/label';
import type { SettingsRecord } from '../../domain/progressRecords';
import { SessionRewards, type RewardsSummary } from '../game/sessionRewards';

/** The self-evaluation buttons: "À revoir", "Difficile", "Je savais", "Je le connais déjà". */
export type SelfEvaluation = 'again' | 'hard' | 'good' | 'known';

export const OUTCOME_OF: Readonly<Record<SelfEvaluation, Outcome>> = {
  again: 'wrong',
  hard: 'correctWithHint',
  good: 'correct',
  known: 'correct',
};

/** Sessions started this long ago may still hold answers of today. */
export const RECENT_SESSIONS_MS = 2 * 24 * 60 * 60 * 1000;

export type FlashcardStore = Pick<
  StudyRepository,
  'load' | 'startSession' | 'recordAnswer' | 'reviseAnswer' | 'endSession' | 'recordProgress'
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
  /** Every label: the pinned ones come first and their tests are planned (GAME_DESIGN.md 2). */
  labels?: readonly Label[];
}

/** A session asked for elsewhere (the home screen): it starts as soon as the screen opens. */
export interface FlashcardLaunch {
  mode: 'review' | 'practice';
  language: Language;
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

/** The two ways of typing an answer. */
export type TypedExercise = Exclude<AnswerExercise, 'selfAssess'>;

export interface TypedAnswerOptions extends AnswerOptions {
  /** What the learner typed, untrusted. */
  answer?: string;
}

/** Typing the word of a meaning is the production exercise typeEcho (GAME_DESIGN.md 6.7). */
export const RECORDED_EXERCISE: Readonly<Record<TypedExercise, ExerciseType>> = {
  typeMeaning: 'typeMeaning',
  typeWord: 'typeEcho',
};

/** Rating of an answer that is never timed: self-evaluations and typed answers alike. */
function untimedRating(
  outcome: Outcome,
  hintsUsed: number,
  knownAlready: boolean,
  config: SrsDependencies['config'],
) {
  return ratingFor(outcome, { exercise: 'typed', responseMs: 0, hintsUsed, knownAlready }, config);
}

/** What today's queue is built from: the stored progress read now, and the learner's day. */
async function loadStudyContext(
  selection: FlashcardSelection,
  { store, srs, clock }: Pick<FlashcardSessionDependencies, 'store' | 'srs' | 'clock'>,
) {
  const now = clock();
  const since = new Date(now.getTime() - RECENT_SESSIONS_MS).toISOString();
  const data = await store.load(since);
  const today = studyDay(now, data.progress?.lastActiveDate, srs);
  return {
    now,
    today,
    cards: selection.cards,
    states: data.reviewStates,
    newPerDay: newPerDayOf(data.settings),
    newIntroducedToday: countNewWordsIntroduced(data.recentSessions, today, srs),
    language: selection.language,
    labelIds: selection.labelIds,
    ...(selection.labels === undefined
      ? {}
      : { focus: focusPlanningOf(selection.labels, data.settings) }),
  };
}

/** The labels to work on, with the tests the learner prepares in intensive mode. */
export function focusPlanningOf(
  labels: readonly Label[],
  settings: SettingsRecord | undefined,
): FocusPlanning {
  const intensive = Object.entries(settings?.intensiveExamMode ?? {});
  return {
    labels,
    exam: EXAM_CONFIG,
    intensiveLabelIds: intensive.filter(([, chosen]) => chosen).map(([labelId]) => labelId),
  };
}

/** Starts today's flashcards: the day and the queue are fixed now, for the whole session. */
export async function startFlashcardSession(
  selection: FlashcardSelection,
  deps: FlashcardSessionDependencies,
): Promise<FlashcardSession> {
  const context = await loadStudyContext(selection, deps);
  const id = deps.newId();
  const items = buildReviewQueue({ ...context, seed: id }, deps.srs);
  return new FlashcardSession(id, context.today, items, selection, deps);
}

/** Today's outlook, with the day it was computed for and the daily quota of new words. */
export interface StudyOutlookView extends StudyOutlook {
  today: LocalDay;
  newPerDay: number;
}

/** Explains what a session on this selection would hold today, and what comes next. */
export async function loadStudyOutlook(
  selection: FlashcardSelection,
  deps: Pick<FlashcardSessionDependencies, 'store' | 'srs' | 'clock'>,
): Promise<StudyOutlookView> {
  const context = await loadStudyContext(selection, deps);
  return {
    ...summarizeStudyOutlook(context, deps.srs),
    today: context.today,
    newPerDay: context.newPerDay,
  };
}

interface RecordedAnswer {
  outcome: Outcome;
  exercise: ExerciseType;
  hintsUsed: number;
  knownAlready: boolean;
  answer?: string | undefined;
  typed?: TypedExercise;
}

interface LastAnswer {
  item: ReviewQueueItem;
  answer: GivenAnswer;
  /** Absent for a self-evaluation. */
  typed?: TypedExercise;
}

/** One pass through the queue; every answer is stored as soon as it is given. */
export class FlashcardSession {
  private index = 0;
  private started = false;
  private left = false;
  private readonly changes: StageChange[] = [];
  private readonly answeredKinds: ReviewQueueItem['kind'][] = [];
  /** The last answer, with the state before it, kept to be accepted by "J'avais bon". */
  private last: LastAnswer | undefined;
  private readonly gameRewards = new SessionRewards();
  private correctAnswers = 0;

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
    const item = this.currentItem();
    const knownAlready = evaluation === 'known';
    if (knownAlready && item.kind !== 'new') {
      throw new Error('"I already know it" is only for a new word');
    }
    const exercise = item.kind === 'new' ? 'discovery' : 'audioFlashcard';
    await this.record(item, { outcome: OUTCOME_OF[evaluation], exercise, hintsUsed, knownAlready });
  }

  /**
   * A typed answer, checked by the caller. A new word stays recorded as discovered, which the
   * daily quota of new words counts.
   */
  async answerTyped(
    typed: TypedExercise,
    outcome: Outcome,
    { hintsUsed = 0, answer }: TypedAnswerOptions = {},
  ): Promise<void> {
    const item = this.currentItem();
    const exercise = item.kind === 'new' ? 'discovery' : RECORDED_EXERCISE[typed];
    await this.record(item, { outcome, exercise, hintsUsed, knownAlready: false, answer, typed });
  }

  /**
   * "J'avais bon": the last typed meaning was right after all, a synonym the card lacks. Its
   * rating is replaced, never added (GAME_DESIGN.md 1.2). Typing the word is checked exactly:
   * it cannot be overruled.
   */
  async acceptLastAnswer(): Promise<void> {
    const last = this.last;
    if (last?.typed !== 'typeMeaning') {
      throw new Error('Only a typed meaning can be accepted');
    }
    const { store, srs, clock } = this.deps;
    const accepted = acceptAsCorrect(last.answer, { now: clock(), today: this.today }, srs);
    await store.reviseAnswer({
      sessionId: this.id,
      state: accepted.state,
      result: accepted.result,
      activeDay: this.today,
    });
    this.last = { ...last, answer: { ...last.answer, result: accepted.result } };
    this.noteStageChange(last.item, accepted.state);
  }

  /** Leaves early: the answers given are already stored. */
  async quit(): Promise<void> {
    this.left = true;
    await this.end();
  }

  /** What the session brought to the game; nothing before the first saved answer. */
  rewards(): RewardsSummary | undefined {
    return this.gameRewards.summary();
  }

  summary(): SessionSummary {
    return {
      reviewed: this.answeredKinds.filter((kind) => kind === 'review').length,
      introduced: this.answeredKinds.filter((kind) => kind === 'new').length,
      stageChanges: [...this.changes],
    };
  }

  private currentItem(): ReviewQueueItem {
    const item = this.current;
    if (item === undefined) {
      throw new Error('The session is finished');
    }
    return item;
  }

  private async record(item: ReviewQueueItem, answer: RecordedAnswer): Promise<void> {
    const { store, srs, clock } = this.deps;
    const now = clock();
    const { outcome, exercise, hintsUsed, knownAlready } = answer;
    const rating = untimedRating(outcome, hintsUsed, knownAlready, srs.config);
    const { state, rated } = applyAnswer(item.state, rating, { now, today: this.today }, srs);
    const events = answerEvents(
      {
        cardId: item.card.id,
        language: item.card.language,
        exercise,
        outcome,
        rated,
        sessionKind: 'daily',
        before: item.state,
        after: state,
      },
      srs.config,
    );
    const result: SessionResultRecord = {
      cardId: item.card.id,
      outcome,
      exercise,
      rating,
      hintsUsed,
      ...(answer.answer === undefined ? {} : { answer: cleanAnswer(answer.answer) }),
      at: now.toISOString(),
    };
    await this.ensureStarted(now);
    await store.recordAnswer({
      sessionId: this.id,
      state,
      result,
      activeDay: this.today,
      progress: this.gameRewards.update(events, this.today),
    });
    this.gameRewards.confirm();

    this.last = {
      item,
      answer: { before: item.state, result },
      ...(answer.typed === undefined ? {} : { typed: answer.typed }),
    };
    this.answeredKinds.push(item.kind);
    if (outcome === 'correct') {
      this.correctAnswers += 1;
    }
    this.noteStageChange(item, state);
    this.index += 1;
    if (this.finished) {
      await this.complete();
      await this.end();
    }
  }

  /** The summary is reached: the session earns its points and makes the day active. */
  private async complete(): Promise<void> {
    await this.deps.store.recordProgress(
      this.gameRewards.update(
        [
          {
            type: 'SessionCompleted',
            language: this.selection.language,
            kind: 'daily',
            answers: this.answeredKinds.length,
            correct: this.correctAnswers,
          },
        ],
        this.today,
      ),
    );
    this.gameRewards.confirm();
  }

  /** The stage change of a word, compared with the state it had when the session started. */
  private noteStageChange(item: ReviewQueueItem, state: ReviewState): void {
    const { config } = this.deps.srs;
    const at = this.changes.findIndex(({ card }) => card.id === item.card.id);
    if (at !== -1) {
      this.changes.splice(at, 1);
    }
    const from = stageOf(item.state, config);
    const to = stageOf(state, config);
    if (from !== to) {
      this.changes.push({ card: item.card, from, to });
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
