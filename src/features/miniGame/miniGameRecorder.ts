import type { Card, Language } from '../../domain/card';
import { cleanAnswer } from '../../domain/dictation/answerText';
import {
  gameLevelKey,
  initialGameLevel,
  recordGameAnswer,
} from '../../domain/game/adaptiveDifficulty';
import { answerEvents } from '../../domain/game/answerEvents';
import { MINI_GAME_CONFIG, type Difficulty } from '../../domain/game/miniGameConfig';
import type { ExerciseType, GameLevel, SessionResultRecord } from '../../domain/progressRecords';
import { applyAnswer } from '../../domain/srs/applyAnswer';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import type { LocalDay } from '../../domain/srs/localDay';
import {
  createInitialReviewState,
  type Outcome,
  type Rating,
  type ReviewState,
  type Stage,
} from '../../domain/srs/reviewState';
import { stageOf } from '../../domain/srs/stage';
import { studyDay } from '../../domain/srs/studyDay';
import type { StudyRepository } from '../../storage/studyRepository';
import { SessionRewards, type RewardsSummary } from '../game/sessionRewards';

export type MiniGameStore = Pick<
  StudyRepository,
  'load' | 'startSession' | 'recordAnswer' | 'endSession' | 'recordProgress'
>;

export interface MiniGameDependencies {
  store: MiniGameStore;
  srs: SrsDependencies;
  clock: () => Date;
  newId: () => string;
}

/** The words a mini-game is played on. */
export interface MiniGameSelection {
  cards: readonly Card[];
  language: Language;
  /** Empty: every word of the language. */
  labelIds: readonly string[];
  /**
   * Words imposed by a step session of the path (GAME_DESIGN.md 5.3): they are asked first,
   * the other words of the language only fill the boards and offer distractors.
   */
  cardIds?: readonly string[];
}

export interface GivenAnswer {
  card: Card;
  outcome: Outcome;
  /** The FSRS rating; absent for a game that never rates the word (ToneEcho, SentenceShuffle). */
  rating?: Rating;
  hintsUsed: number;
  responseMs: number;
  /** What the learner chose or typed, kept for the history. */
  answer?: string;
}

export interface AnswerStored {
  /** False when the word's memory was left untouched: already rated today, or never rated. */
  rated: boolean;
}

export interface MiniGameSummary {
  answered: number;
  correct: number;
}

/** Sessions started this long ago may still hold answers of today. */
const RECENT_SESSIONS_MS = 2 * 24 * 60 * 60 * 1000;

/** Loads what a mini-game round needs: the review states, the day and the game's level. */
export async function openMiniGame(
  exercise: ExerciseType,
  selection: MiniGameSelection,
  deps: MiniGameDependencies,
): Promise<MiniGameRecorder> {
  const now = deps.clock();
  const data = await deps.store.load(new Date(now.getTime() - RECENT_SESSIONS_MS).toISOString());
  const today = studyDay(now, data.progress?.lastActiveDate, deps.srs);
  const key = gameLevelKey(exercise, selection.language);
  const level = data.progress?.gameLevels?.[key] ?? initialGameLevel(MINI_GAME_CONFIG);
  return new MiniGameRecorder(
    deps.newId(),
    today,
    exercise,
    selection,
    data.reviewStates,
    level,
    deps,
  );
}

/**
 * Stores each answer of a mini-game round as soon as it is given, with its points, through the
 * same path as the flashcards: FSRS once a day, XP, active day, adaptive level.
 */
export class MiniGameRecorder {
  private readonly states: Map<string, ReviewState>;
  private gameLevel: GameLevel;
  private started = false;
  private answered = 0;
  private correct = 0;
  private readonly gameRewards = new SessionRewards();

  constructor(
    readonly id: string,
    readonly today: LocalDay,
    readonly exercise: ExerciseType,
    private readonly selection: Pick<MiniGameSelection, 'language' | 'labelIds'>,
    states: readonly ReviewState[],
    level: GameLevel,
    private readonly deps: MiniGameDependencies,
  ) {
    this.states = new Map(states.map((state) => [state.cardId, state]));
    this.gameLevel = level;
  }

  /** The adaptive level of the game in this language (GAME_DESIGN.md 6.0). */
  get level(): Difficulty {
    return this.gameLevel.level;
  }

  /** The review states read at the start, updated by the answers. */
  get reviewStates(): ReviewState[] {
    return [...this.states.values()];
  }

  /** Ids of the words already introduced (reps >= 1): preferred as distractors. */
  introducedIds(): Set<string> {
    return new Set(this.reviewStates.filter(({ reps }) => reps > 0).map(({ cardId }) => cardId));
  }

  stageOf(card: Card): Stage {
    return stageOf(this.stateOf(card, new Date(0)), this.deps.srs.config);
  }

  /** The FSRS settings, e.g. the time after which a right choice is rated hard. */
  get srsConfig(): SrsDependencies['config'] {
    return this.deps.srs.config;
  }

  now(): Date {
    return this.deps.clock();
  }

  async record({
    card,
    outcome,
    rating,
    hintsUsed,
    responseMs,
    answer,
  }: GivenAnswer): Promise<AnswerStored> {
    const { store, srs, clock } = this.deps;
    const now = clock();
    const before = rating === undefined ? undefined : this.stateOf(card, now);
    const applied =
      before === undefined || rating === undefined
        ? undefined
        : applyAnswer(before, rating, { now, today: this.today }, srs);
    const result: SessionResultRecord = {
      cardId: card.id,
      outcome,
      exercise: this.exercise,
      ...(rating === undefined ? {} : { rating }),
      hintsUsed,
      responseMs,
      ...(answer === undefined ? {} : { answer: cleanAnswer(answer) }),
      at: now.toISOString(),
    };
    const events = answerEvents(
      {
        cardId: card.id,
        language: card.language,
        exercise: this.exercise,
        outcome,
        rated: applied?.rated ?? false,
        sessionKind: 'miniGame',
        ...(before === undefined || applied === undefined ? {} : { before, after: applied.state }),
      },
      srs.config,
    );
    await this.ensureStarted(now);
    await store.recordAnswer({
      sessionId: this.id,
      ...(applied === undefined ? {} : { state: applied.state }),
      result,
      activeDay: this.today,
      progress: this.gameRewards.update(events, this.today),
    });
    this.gameRewards.confirm();
    if (applied !== undefined) {
      this.states.set(card.id, applied.state);
    }
    this.gameLevel = recordGameAnswer(this.gameLevel, outcome === 'correct', MINI_GAME_CONFIG);
    this.answered += 1;
    this.correct += outcome === 'correct' ? 1 : 0;
    return { rated: applied?.rated ?? false };
  }

  /** The round is over: its points, then the end of the session. */
  async complete(): Promise<void> {
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

  /** Leaves early: the answers given are already stored. */
  async quit(): Promise<void> {
    await this.end();
  }

  summary(): MiniGameSummary {
    return { answered: this.answered, correct: this.correct };
  }

  rewards(): RewardsSummary | undefined {
    return this.gameRewards.summary();
  }

  private stateOf(card: Card, now: Date): ReviewState {
    return this.states.get(card.id) ?? createInitialReviewState(card.id, now);
  }

  private async ensureStarted(now: Date): Promise<void> {
    if (this.started) {
      return;
    }
    await this.deps.store.startSession({
      id: this.id,
      language: this.selection.language,
      labelIds: [...this.selection.labelIds],
      mode: this.exercise,
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
