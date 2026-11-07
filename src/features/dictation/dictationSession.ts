import type { Card, Language } from '../../domain/card';
import { cleanAnswer } from '../../domain/dictation/answerText';
import { answerEvents } from '../../domain/game/answerEvents';
import type { SessionResultRecord } from '../../domain/progressRecords';
import { applyAnswer, type AnswerApplied } from '../../domain/srs/applyAnswer';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import type { LocalDay } from '../../domain/srs/localDay';
import { ratingFor } from '../../domain/srs/rating';
import {
  createInitialReviewState,
  type Outcome,
  type ReviewState,
} from '../../domain/srs/reviewState';
import { studyDay } from '../../domain/srs/studyDay';
import type { StudyRepository } from '../../storage/studyRepository';
import { SessionRewards, type RewardsSummary } from '../game/sessionRewards';

export type DictationStore = Pick<
  StudyRepository,
  'load' | 'startSession' | 'recordAnswer' | 'endSession' | 'recordProgress'
>;

export interface DictationSessionDependencies {
  store: DictationStore;
  srs: SrsDependencies;
  clock: () => Date;
  newId: () => string;
}

export interface DictationSelection {
  language: Language;
  labelIds: readonly string[];
  words: readonly Card[];
}

export interface RecordOptions {
  /** 1 when the pinyin, or the first letter and length, was shown. */
  hintsUsed?: number;
  /** What the learner typed; absent for a dictation on paper. */
  answer?: string;
}

/** Sessions started this long ago may still hold answers of today. */
const RECENT_SESSIONS_MS = 2 * 24 * 60 * 60 * 1000;

/** Starts a dictation: the day and the review states are read once, for the whole dictation. */
export async function startDictationSession(
  selection: DictationSelection,
  deps: DictationSessionDependencies,
): Promise<DictationSession> {
  const now = deps.clock();
  const data = await deps.store.load(new Date(now.getTime() - RECENT_SESSIONS_MS).toISOString());
  const today = studyDay(now, data.progress?.lastActiveDate, deps.srs);
  const states = new Map(data.reviewStates.map((state) => [state.cardId, state]));
  return new DictationSession(deps.newId(), today, states, selection, deps);
}

/** The answers of one dictation; each is stored as soon as it is given. */
export class DictationSession {
  private started = false;
  private readonly gameRewards = new SessionRewards();
  private answered = 0;
  private correct = 0;

  constructor(
    readonly id: string,
    readonly today: LocalDay,
    private readonly states: Map<string, ReviewState>,
    private readonly selection: DictationSelection,
    private readonly deps: DictationSessionDependencies,
  ) {}

  /**
   * Rates a word (a typed exercise, never timed) and stores the answer. The review state is
   * stored even when the word was already rated today and FSRS left it untouched.
   */
  async record(
    card: Card,
    outcome: Outcome,
    { hintsUsed = 0, answer }: RecordOptions = {},
  ): Promise<AnswerApplied> {
    const { store, srs, clock } = this.deps;
    const now = clock();
    const rating = ratingFor(outcome, { exercise: 'typed', responseMs: 0, hintsUsed }, srs.config);
    const current = this.states.get(card.id) ?? createInitialReviewState(card.id, now);
    const applied = applyAnswer(current, rating, { now, today: this.today }, srs);
    const result: SessionResultRecord = {
      cardId: card.id,
      outcome,
      exercise: 'listenType',
      rating,
      hintsUsed,
      ...(answer === undefined ? {} : { answer: cleanAnswer(answer) }),
      at: now.toISOString(),
    };
    const events = answerEvents(
      {
        cardId: card.id,
        language: card.language,
        exercise: 'listenType',
        outcome,
        rated: applied.rated,
        sessionKind: 'dictation',
        before: current,
        after: applied.state,
      },
      srs.config,
    );
    await this.ensureStarted(now);
    await store.recordAnswer({
      sessionId: this.id,
      state: applied.state,
      result,
      activeDay: this.today,
      progress: this.gameRewards.update(events, this.today),
    });
    this.gameRewards.confirm();
    this.answered += 1;
    this.correct += outcome === 'correct' ? 1 : 0;
    this.states.set(card.id, applied.state);
    return applied;
  }

  /** The dictation is over: with at least one word, it earns the points of a finished session. */
  async end(): Promise<void> {
    if (!this.started) {
      return;
    }
    const completed = {
      type: 'SessionCompleted' as const,
      language: this.selection.language,
      kind: 'dictation' as const,
      answers: this.answered,
      correct: this.correct,
    };
    await this.deps.store.recordProgress(this.gameRewards.update([completed], this.today));
    this.gameRewards.confirm();
    await this.deps.store.endSession(this.id, this.deps.clock().toISOString());
  }

  /** What the dictation brought to the game; nothing before the first saved word. */
  rewards(): RewardsSummary | undefined {
    return this.gameRewards.summary();
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
      mode: 'dictation',
      startedAt: now.toISOString(),
      results: [],
    });
    this.started = true;
  }
}
