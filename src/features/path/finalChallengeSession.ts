import type { Card, Language } from '../../domain/card';
import { compareAnswer } from '../../domain/dictation/answerCompare';
import { cleanAnswer } from '../../domain/dictation/answerText';
import { answerEvents } from '../../domain/game/answerEvents';
import {
  listenMeaningAnswer,
  listenMeaningQuestion,
  type ListenMeaningQuestion,
} from '../../domain/game/listenMeaning';
import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
import type { Label } from '../../domain/label';
import {
  composeFinalChallenge,
  scoreFinalChallenge,
  type ChallengeAnswer,
  type ChallengeScore,
  type ChallengeSection,
  type FinalChallengeFinishedEvent,
} from '../../domain/path/finalChallenge';
import { PATH_CONFIG, type PathConfig } from '../../domain/path/pathConfig';
import type { PinyinGenerator } from '../../domain/pinyinGeneration';
import type { ExerciseType, SessionResultRecord } from '../../domain/progressRecords';
import { applyAnswer } from '../../domain/srs/applyAnswer';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import type { LocalDay } from '../../domain/srs/localDay';
import { ratingFor } from '../../domain/srs/rating';
import {
  createInitialReviewState,
  type Outcome,
  type Rating,
  type ReviewState,
} from '../../domain/srs/reviewState';
import { stageOf } from '../../domain/srs/stage';
import { studyDay } from '../../domain/srs/studyDay';
import type { StudyRepository } from '../../storage/studyRepository';
import { RECENT_SESSIONS_MS } from '../flashcards/flashcardSession';
import { SessionRewards } from '../game/sessionRewards';

export type FinalChallengeStore = Pick<
  StudyRepository,
  'load' | 'startSession' | 'recordAnswer' | 'endSession' | 'recordFinalChallenge'
>;

export interface FinalChallengeDependencies {
  store: FinalChallengeStore;
  srs: SrsDependencies;
  clock: () => Date;
  newId: () => string;
  /** pinyin-pro is large: loaded only to explain a Chinese word typed wrong. */
  loadPinyin: () => Promise<PinyinGenerator>;
  config?: PathConfig;
}

export interface FinalChallengeSelection {
  label: Label;
  language: Language;
  /** The words of the label in the language. */
  cards: readonly Card[];
  /** False without a voice: the dictation becomes translation, the listening is read. */
  audio: boolean;
}

/** A question of the challenge: a listening one comes with its options. */
export type ChallengeItem =
  | { section: 'listening'; card: Card; question: ListenMeaningQuestion }
  | { section: 'dictation' | 'translation'; card: Card };

export interface MissedWord {
  card: Card;
  section: ChallengeSection;
}

export interface FinalChallengeResult {
  score: ChallengeScore;
  missed: MissedWord[];
  event: FinalChallengeFinishedEvent;
}

/** The exercise each section records, so that the challenge feeds the path like any answer. */
const EXERCISE_OF: Readonly<Record<ChallengeSection, ExerciseType>> = {
  listening: 'listenMeaning',
  dictation: 'listenType',
  translation: 'typeEcho',
};
const MODE = 'finalChallenge';
/** The listening questions are asked at the hardest level (GAME_DESIGN.md 5.4). */
const LISTENING_LEVEL = 3;

/** Composes today's challenge on the label: the same words if it is started again today. */
export async function startFinalChallenge(
  selection: FinalChallengeSelection,
  deps: FinalChallengeDependencies,
): Promise<FinalChallengeSession> {
  const { store, srs, clock, config = PATH_CONFIG } = deps;
  const now = clock();
  const data = await store.load(new Date(now.getTime() - RECENT_SESSIONS_MS).toISOString());
  const today = studyDay(now, data.progress?.lastActiveDate, srs);
  const states = new Map(data.reviewStates.map((state) => [state.cardId, state]));
  const recall = (cardId: string) => {
    const state = states.get(cardId);
    return state === undefined || state.reps === 0 ? 0 : srs.model.retrievability(state, now);
  };
  const byId = new Map(selection.cards.map((card) => [card.id, card]));
  const pool = {
    cards: selection.cards,
    introduced: new Set(data.reviewStates.filter(({ reps }) => reps > 0).map((s) => s.cardId)),
  };
  const id = deps.newId();
  const items = composeFinalChallenge(selection.cards, recall, today, config).flatMap(
    ({ section, cardIds }) =>
      cardIds.flatMap((cardId, index): ChallengeItem[] => {
        const card = byId.get(cardId);
        if (card === undefined) {
          return [];
        }
        if (section === 'dictation' && !selection.audio) {
          return [{ section: 'translation', card }];
        }
        if (section !== 'listening') {
          return [{ section, card }];
        }
        const stage = stageOf(
          states.get(cardId) ?? createInitialReviewState(cardId, now),
          srs.config,
        );
        const question = listenMeaningQuestion(
          card,
          pool,
          { level: LISTENING_LEVEL, stage, seed: `${id}:${String(index)}` },
          MINI_GAME_CONFIG,
        );
        return [
          question === undefined ? { section: 'translation', card } : { section, card, question },
        ];
      }),
  );
  // A real test asks the sections in order: a question moved to translation joins it.
  const ordered = (['listening', 'dictation', 'translation'] as const).flatMap((section) =>
    items.filter((item) => item.section === section),
  );
  return new FinalChallengeSession(id, today, ordered, states, selection, deps);
}

/**
 * Conditions of a test (GAME_DESIGN.md 5.4): no hint and no feedback until the end, but each
 * answer is stored at once and rated as usual (one FSRS rating per word and per day).
 */
export class FinalChallengeSession {
  private index = 0;
  private started = false;
  private left = false;
  private shownAt: number;
  private readonly answers: (ChallengeAnswer & { card: Card })[] = [];
  private readonly gameRewards = new SessionRewards();

  constructor(
    readonly id: string,
    readonly today: LocalDay,
    readonly items: readonly ChallengeItem[],
    private readonly states: Map<string, ReviewState>,
    private readonly selection: FinalChallengeSelection,
    private readonly deps: FinalChallengeDependencies,
  ) {
    this.shownAt = deps.clock().getTime();
  }

  get current(): ChallengeItem | undefined {
    return this.left ? undefined : this.items[this.index];
  }

  get position(): number {
    return this.index;
  }

  get total(): number {
    return this.items.length;
  }

  /** A meaning chosen in a listening question, timed like any choice. */
  async choose(choice: Card | 'unknown'): Promise<void> {
    const item = this.currentItem();
    if (item.section !== 'listening') {
      throw new Error('Not a listening question');
    }
    const { question } = item;
    const responseMs = Math.max(0, this.deps.clock().getTime() - this.shownAt);
    const { outcome, rating } = listenMeaningAnswer(
      question,
      choice,
      { hintsUsed: 0, responseMs },
      this.deps.srs.config,
    );
    await this.record(item, outcome, rating, choice === 'unknown' ? undefined : choice.translation);
  }

  /** A word typed in the dictation or the translation, checked like a dictated word. */
  async type(given: string): Promise<void> {
    const item = this.currentItem();
    if (item.section === 'listening') {
      throw new Error('A listening question is answered by a choice');
    }
    const { outcome } = await compareAnswer(
      { language: item.card.language, expected: item.card.term, given },
      { loadPinyin: this.deps.loadPinyin },
    );
    const rating = ratingFor(
      outcome,
      { exercise: 'typed', responseMs: 0, hintsUsed: 0 },
      this.deps.srs.config,
    );
    await this.record(item, outcome, rating, given);
  }

  /** "Je ne sais pas": a wrong answer, never worse than a guess. */
  async skip(): Promise<void> {
    const item = this.currentItem();
    await this.record(item, 'wrong', 'again');
  }

  /** The score out of 20, stored with the best one; the missed words to review. */
  async finish(): Promise<FinalChallengeResult> {
    const config = this.deps.config ?? PATH_CONFIG;
    const score = scoreFinalChallenge(this.answers, this.items.length, config);
    const { label, language } = this.selection;
    const event = await this.deps.store.recordFinalChallenge(
      label.id,
      language,
      score.score20,
      this.today,
    );
    await this.end();
    return {
      score,
      missed: this.answers
        .filter(({ outcome }) => outcome !== 'correct')
        .map(({ card, section }) => ({ card, section })),
      event,
    };
  }

  /** Leaves early: the answers given are stored, the challenge is not scored. */
  async quit(): Promise<void> {
    this.left = true;
    await this.end();
  }

  private currentItem(): ChallengeItem {
    const item = this.current;
    if (item === undefined) {
      throw new Error('The challenge is over');
    }
    return item;
  }

  private async record(item: ChallengeItem, outcome: Outcome, rating: Rating, answer?: string) {
    const { store, srs, clock } = this.deps;
    const now = clock();
    const exercise = EXERCISE_OF[item.section];
    const before = this.states.get(item.card.id) ?? createInitialReviewState(item.card.id, now);
    const applied = applyAnswer(before, rating, { now, today: this.today }, srs);
    const result: SessionResultRecord = {
      cardId: item.card.id,
      outcome,
      exercise,
      rating,
      hintsUsed: 0,
      ...(answer === undefined ? {} : { answer: cleanAnswer(answer) }),
      at: now.toISOString(),
    };
    const events = answerEvents(
      {
        cardId: item.card.id,
        language: item.card.language,
        exercise,
        outcome,
        rated: applied.rated,
        sessionKind: 'daily',
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
    this.states.set(item.card.id, applied.state);
    this.answers.push({ section: item.section, outcome, card: item.card });
    this.index += 1;
    this.shownAt = clock().getTime();
  }

  private async ensureStarted(now: Date): Promise<void> {
    if (this.started) {
      return;
    }
    await this.deps.store.startSession({
      id: this.id,
      language: this.selection.language,
      labelIds: [this.selection.label.id],
      mode: MODE,
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
