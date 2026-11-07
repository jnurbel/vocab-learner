import type { Card, Language } from '../../domain/card';
import { cleanAnswer } from '../../domain/dictation/answerText';
import {
  gameLevelKey,
  initialGameLevel,
  recordGameAnswer,
} from '../../domain/game/adaptiveDifficulty';
import { answerEvents } from '../../domain/game/answerEvents';
import {
  listenMeaningAnswer,
  listenMeaningQuestion,
  listenMeaningRound,
  type ListenMeaningQuestion,
  type ListenMeaningResult,
} from '../../domain/game/listenMeaning';
import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
import type { GameLevel, SessionResultRecord } from '../../domain/progressRecords';
import { applyAnswer } from '../../domain/srs/applyAnswer';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import type { LocalDay } from '../../domain/srs/localDay';
import { createInitialReviewState, type ReviewState } from '../../domain/srs/reviewState';
import { stageOf } from '../../domain/srs/stage';
import { studyDay } from '../../domain/srs/studyDay';
import type { StudyRepository } from '../../storage/studyRepository';
import { SessionRewards, type RewardsSummary } from '../game/sessionRewards';

export type ListenMeaningStore = Pick<
  StudyRepository,
  'load' | 'startSession' | 'recordAnswer' | 'endSession' | 'recordProgress'
>;

export interface ListenMeaningDependencies {
  store: ListenMeaningStore;
  srs: SrsDependencies;
  clock: () => Date;
  newId: () => string;
}

export interface ListenMeaningSelection {
  cards: readonly Card[];
  language: Language;
  /** Empty: every word of the language. */
  labelIds: readonly string[];
  /**
   * A step session of the path asks these words only, in a round of their own size; the other
   * words of the selection serve as distractors (GAME_DESIGN.md 5.3).
   */
  targetCardIds?: readonly string[];
}

/** A round started from elsewhere, such as a step session of the path, on these words only. */
export type ListenMeaningLaunch = Omit<ListenMeaningSelection, 'cards' | 'targetCardIds'> & {
  targetCardIds: readonly string[];
};

export interface GivenChoice {
  /** 1 when the written word was shown as a hint. */
  hintsUsed: number;
}

export interface ChoiceRecorded extends ListenMeaningResult {
  /** False when the word was already rated today: its memory was left untouched. */
  rated: boolean;
}

export interface ListenMeaningSummary {
  answered: number;
  correct: number;
}

/** Words in a round: about 90 seconds at 7 seconds an item (GAME_DESIGN.md 11). */
export const LISTEN_MEANING_ROUND_SIZE = 12;
const EXERCISE = 'listenMeaning';
/** Sessions started this long ago may still hold answers of today. */
const RECENT_SESSIONS_MS = 2 * 24 * 60 * 60 * 1000;

export async function startListenMeaningSession(
  selection: ListenMeaningSelection,
  deps: ListenMeaningDependencies,
): Promise<ListenMeaningSession> {
  const now = deps.clock();
  const data = await deps.store.load(new Date(now.getTime() - RECENT_SESSIONS_MS).toISOString());
  const today = studyDay(now, data.progress?.lastActiveDate, deps.srs);
  const chosen = selection.cards.filter(
    (card) =>
      selection.labelIds.length === 0 ||
      card.labelIds.some((id) => selection.labelIds.includes(id)),
  );
  const id = deps.newId();
  const key = gameLevelKey(EXERCISE, selection.language);
  const level = data.progress?.gameLevels?.[key] ?? initialGameLevel(MINI_GAME_CONFIG);
  return new ListenMeaningSession(id, today, selection, chosen, data.reviewStates, level, deps);
}

/** One round of ListenMeaning; each answer is stored as soon as it is given. */
export class ListenMeaningSession {
  private readonly states: Map<string, ReviewState>;
  private readonly round: Card[];
  private readonly pool;
  private index = 0;
  private question: ListenMeaningQuestion | undefined;
  private shownAt = 0;
  private started = false;
  private answered = 0;
  private correct = 0;
  private readonly gameRewards = new SessionRewards();

  constructor(
    readonly id: string,
    readonly today: LocalDay,
    private readonly selection: ListenMeaningSelection,
    cards: readonly Card[],
    states: readonly ReviewState[],
    private level: GameLevel,
    private readonly deps: ListenMeaningDependencies,
  ) {
    this.states = new Map(states.map((state) => [state.cardId, state]));
    const targets = selection.targetCardIds;
    this.round =
      targets === undefined
        ? listenMeaningRound(cards, states, selection.language, {
            seed: id,
            size: LISTEN_MEANING_ROUND_SIZE,
          })
        : listenMeaningRound(
            cards.filter(({ id: cardId }) => targets.includes(cardId)),
            [],
            selection.language,
            { seed: id, size: targets.length },
          );
    this.pool = {
      cards,
      introduced: new Set(states.filter(({ reps }) => reps > 0).map(({ cardId }) => cardId)),
    };
    this.nextQuestion();
  }

  /** The question to answer, or undefined once the round is over. */
  get current(): ListenMeaningQuestion | undefined {
    return this.question;
  }

  /** False when no word of the selection can be asked, such as a single word. */
  get eligible(): boolean {
    return this.answered > 0 || this.question !== undefined;
  }

  get position(): number {
    return this.answered;
  }

  get total(): number {
    return this.round.length;
  }

  async answer(choice: Card | 'unknown', { hintsUsed }: GivenChoice): Promise<ChoiceRecorded> {
    const question = this.question;
    if (question === undefined) {
      throw new Error('The round is over');
    }
    const { store, srs, clock } = this.deps;
    const now = clock();
    const responseMs = Math.max(0, now.getTime() - this.shownAt);
    const evaluated = listenMeaningAnswer(question, choice, { hintsUsed, responseMs }, srs.config);
    const target = question.target;
    const before = this.stateOf(target, now);
    const applied = applyAnswer(before, evaluated.rating, { now, today: this.today }, srs);
    const result: SessionResultRecord = {
      cardId: target.id,
      outcome: evaluated.outcome,
      exercise: EXERCISE,
      rating: evaluated.rating,
      hintsUsed,
      responseMs,
      ...(choice === 'unknown' ? {} : { answer: cleanAnswer(choice.translation) }),
      at: now.toISOString(),
    };
    const events = answerEvents(
      {
        cardId: target.id,
        language: target.language,
        exercise: EXERCISE,
        outcome: evaluated.outcome,
        rated: applied.rated,
        sessionKind: 'miniGame',
        before,
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
    this.states.set(target.id, applied.state);
    this.level = recordGameAnswer(this.level, evaluated.outcome === 'correct', MINI_GAME_CONFIG);
    this.answered += 1;
    this.correct += evaluated.outcome === 'correct' ? 1 : 0;
    this.index += 1;
    this.nextQuestion();
    if (this.question === undefined) {
      await this.complete();
    }
    return { ...evaluated, rated: applied.rated };
  }

  /** Leaves early: the answers given are already stored. */
  async quit(): Promise<void> {
    this.question = undefined;
    await this.end();
  }

  summary(): ListenMeaningSummary {
    return { answered: this.answered, correct: this.correct };
  }

  rewards(): RewardsSummary | undefined {
    return this.gameRewards.summary();
  }

  private stateOf(card: Card, now: Date): ReviewState {
    return this.states.get(card.id) ?? createInitialReviewState(card.id, now);
  }

  /** The next word that can be asked; a word without any possible distractor is skipped. */
  private nextQuestion(): void {
    this.question = undefined;
    while (this.question === undefined) {
      const target = this.round[this.index];
      if (target === undefined) {
        break;
      }
      const stage = stageOf(this.stateOf(target, new Date(0)), this.deps.srs.config);
      this.question = listenMeaningQuestion(
        target,
        this.pool,
        { level: this.level.level, stage, seed: `${this.id}:${String(this.index)}` },
        MINI_GAME_CONFIG,
      );
      if (this.question === undefined) {
        this.index += 1;
      }
    }
    this.shownAt = this.deps.clock().getTime();
  }

  private async complete(): Promise<void> {
    await this.deps.store.recordProgress(
      this.gameRewards.update(
        [
          {
            type: 'SessionCompleted',
            language: this.selection.language,
            kind: 'miniGame',
            answers: this.answered,
            correct: this.correct,
          },
        ],
        this.today,
      ),
    );
    this.gameRewards.confirm();
    await this.end();
  }

  private async ensureStarted(now: Date): Promise<void> {
    if (this.started) {
      return;
    }
    await this.deps.store.startSession({
      id: this.id,
      language: this.selection.language,
      labelIds: [...this.selection.labelIds],
      mode: EXERCISE,
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
