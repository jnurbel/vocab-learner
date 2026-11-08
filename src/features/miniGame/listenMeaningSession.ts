import type { Card } from '../../domain/card';
import {
  listenMeaningAnswer,
  listenMeaningQuestion,
  listenMeaningRound,
  type ListenMeaningQuestion,
  type ListenMeaningResult,
} from '../../domain/game/listenMeaning';
import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
import type { RewardsSummary } from '../game/sessionRewards';
import {
  openMiniGame,
  type MiniGameDependencies,
  type MiniGameRecorder,
  type MiniGameSelection,
  type MiniGameStore,
  type MiniGameSummary,
} from './miniGameRecorder';

export type ListenMeaningStore = MiniGameStore;
export type ListenMeaningDependencies = MiniGameDependencies;
export interface ListenMeaningSelection extends MiniGameSelection {
  /**
   * A step session of the path asks these words only, in a round of their own size; the other
   * words of the selection serve as distractors (GAME_DESIGN.md 5.3).
   */
  targetCardIds?: readonly string[];
}
export type ListenMeaningSummary = MiniGameSummary;

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

/** Words in a round: about 90 seconds at 7 seconds an item (GAME_DESIGN.md 11). */
export const LISTEN_MEANING_ROUND_SIZE = 12;

export async function startListenMeaningSession(
  selection: ListenMeaningSelection,
  deps: ListenMeaningDependencies,
): Promise<ListenMeaningSession> {
  const chosen = selection.cards.filter(
    (card) =>
      selection.labelIds.length === 0 ||
      card.labelIds.some((id) => selection.labelIds.includes(id)),
  );
  const recorder = await openMiniGame('listenMeaning', selection, deps);
  return new ListenMeaningSession(recorder, selection, chosen);
}

/** One round of ListenMeaning; each answer is stored as soon as it is given. */
export class ListenMeaningSession {
  private readonly round: Card[];
  private readonly pool;
  private index = 0;
  private question: ListenMeaningQuestion | undefined;
  private shownAt = 0;

  constructor(
    private readonly recorder: MiniGameRecorder,
    selection: ListenMeaningSelection,
    cards: readonly Card[],
  ) {
    const targets = selection.targetCardIds;
    this.round =
      targets === undefined
        ? listenMeaningRound(cards, recorder.reviewStates, selection.language, {
            seed: recorder.id,
            size: LISTEN_MEANING_ROUND_SIZE,
          })
        : listenMeaningRound(
            cards.filter(({ id: cardId }) => targets.includes(cardId)),
            [],
            selection.language,
            { seed: recorder.id, size: targets.length },
          );
    this.pool = { cards, introduced: recorder.introducedIds() };
    this.nextQuestion();
  }

  get id(): string {
    return this.recorder.id;
  }

  /** The question to answer, or undefined once the round is over. */
  get current(): ListenMeaningQuestion | undefined {
    return this.question;
  }

  /** False when no word of the selection can be asked, such as a single word. */
  get eligible(): boolean {
    return this.recorder.summary().answered > 0 || this.question !== undefined;
  }

  get position(): number {
    return this.recorder.summary().answered;
  }

  get total(): number {
    return this.round.length;
  }

  async answer(choice: Card | 'unknown', { hintsUsed }: GivenChoice): Promise<ChoiceRecorded> {
    const question = this.question;
    if (question === undefined) {
      throw new Error('The round is over');
    }
    const now = this.recorder.now();
    const responseMs = Math.max(0, now.getTime() - this.shownAt);
    const evaluated = listenMeaningAnswer(
      question,
      choice,
      { hintsUsed, responseMs },
      this.recorder.srsConfig,
    );
    const { rated } = await this.recorder.record({
      card: question.target,
      outcome: evaluated.outcome,
      rating: evaluated.rating,
      hintsUsed,
      responseMs,
      ...(choice === 'unknown' ? {} : { answer: choice.translation }),
    });
    this.index += 1;
    this.nextQuestion();
    if (this.question === undefined) {
      await this.recorder.complete();
    }
    return { ...evaluated, rated };
  }

  /** Leaves early: the answers given are already stored. */
  async quit(): Promise<void> {
    this.question = undefined;
    await this.recorder.quit();
  }

  summary(): ListenMeaningSummary {
    return this.recorder.summary();
  }

  rewards(): RewardsSummary | undefined {
    return this.recorder.rewards();
  }

  /** The next word that can be asked; a word without any possible distractor is skipped. */
  private nextQuestion(): void {
    this.question = undefined;
    while (this.question === undefined) {
      const target = this.round[this.index];
      if (target === undefined) {
        break;
      }
      this.question = listenMeaningQuestion(
        target,
        this.pool,
        {
          level: this.recorder.level,
          stage: this.recorder.stageOf(target),
          seed: `${this.recorder.id}:${String(this.index)}`,
        },
        MINI_GAME_CONFIG,
      );
      if (this.question === undefined) {
        this.index += 1;
      }
    }
    this.shownAt = this.recorder.now().getTime();
  }
}
