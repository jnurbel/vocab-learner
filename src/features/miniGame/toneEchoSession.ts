import {
  pickToneEchoQuestion,
  questionCard,
  questionKey,
  toneEchoAnswer,
  toneEchoPool,
  type ToneEchoPool,
  type ToneEchoQuestion,
} from '../../domain/game/toneEcho';
import { createRng } from '../../domain/srs/random';
import type { Outcome } from '../../domain/srs/reviewState';
import type { RewardsSummary } from '../game/sessionRewards';
import {
  openMiniGame,
  type MiniGameDependencies,
  type MiniGameRecorder,
  type MiniGameSelection,
  type MiniGameSummary,
} from './miniGameRecorder';

/** Questions in a round: about 50 seconds at 5 seconds an item (GAME_DESIGN.md 6.3). */
export const TONE_ECHO_ROUND_SIZE = 10;

export interface ToneAnswered {
  outcome: Outcome;
  /** The question answered, kept for the feedback. */
  question: ToneEchoQuestion;
}

export async function startToneEchoSession(
  selection: MiniGameSelection,
  deps: MiniGameDependencies,
): Promise<ToneEchoSession> {
  const recorder = await openMiniGame('toneEcho', selection, deps);
  const pool = toneEchoPool(selection.cards, selection.language, selection.cardIds);
  return new ToneEchoSession(recorder, pool);
}

/**
 * A round of ToneEcho. It tests a sound, not the memory of a word: no FSRS rating, but the
 * points and the path (GAME_DESIGN.md 6.3). A pair of our English list holding no word of the
 * learner is played for practice only, and stored nowhere.
 */
export class ToneEchoSession {
  private question: ToneEchoQuestion | undefined;
  private readonly asked = new Set<string>();
  private readonly rng;
  private answered = 0;
  private correct = 0;
  private shownAt = 0;

  constructor(
    private readonly recorder: MiniGameRecorder,
    private readonly pool: ToneEchoPool,
  ) {
    this.rng = createRng(recorder.id);
    this.nextQuestion();
  }

  get current(): ToneEchoQuestion | undefined {
    return this.question;
  }

  /** False when no word offers a sound to hear, such as a Chinese word without pinyin. */
  get eligible(): boolean {
    return this.answered > 0 || this.question !== undefined;
  }

  get position(): number {
    return this.answered;
  }

  get total(): number {
    return TONE_ECHO_ROUND_SIZE;
  }

  /** A tone 1 to 5 (5 neutral), a typed pattern such as "34", or the side heard: 0 or 1. */
  async answer(given: number | string): Promise<ToneAnswered> {
    const question = this.question;
    if (question === undefined) {
      throw new Error('The round is over');
    }
    const outcome = toneEchoAnswer(question, given);
    const card = questionCard(question);
    if (card !== undefined) {
      await this.recorder.record({
        card,
        outcome,
        hintsUsed: 0,
        responseMs: Math.max(0, this.recorder.now().getTime() - this.shownAt),
        answer: String(given),
      });
    }
    this.answered += 1;
    this.correct += outcome === 'correct' ? 1 : 0;
    this.nextQuestion();
    if (this.question === undefined) {
      await this.end(true);
    }
    return { outcome, question };
  }

  /** Leaves early: the answers given are already stored. */
  async quit(): Promise<void> {
    this.question = undefined;
    await this.end(false);
  }

  summary(): MiniGameSummary {
    return { answered: this.answered, correct: this.correct };
  }

  rewards(): RewardsSummary | undefined {
    return this.recorder.rewards();
  }

  private nextQuestion(): void {
    this.question =
      this.answered < TONE_ECHO_ROUND_SIZE
        ? pickToneEchoQuestion(this.pool, this.recorder.level, this.rng, this.asked)
        : undefined;
    if (this.question !== undefined) {
      this.asked.add(questionKey(this.question));
    }
    this.shownAt = this.recorder.now().getTime();
  }

  /** A round of our list only stored nothing: it earns no points for a finished round either. */
  private async end(finished: boolean): Promise<void> {
    if (finished && this.recorder.summary().answered > 0) {
      await this.recorder.complete();
    } else {
      await this.recorder.quit();
    }
  }
}
