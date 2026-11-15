import {
  isMeasureWordEligible,
  measureWordAnswer,
  measureWordQuestion,
  type MeasureWordQuestion,
} from '../../domain/game/measureWord';
import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
import { shuffle } from '../../domain/game/shuffle';
import { createRng } from '../../domain/srs/random';
import type { Outcome } from '../../domain/srs/reviewState';
import type { RewardsSummary } from '../game/sessionRewards';
import { sentenceResourcesOf, type SentenceGameDependencies } from './gapFillSession';
import {
  openMiniGame,
  type MiniGameRecorder,
  type MiniGameSelection,
  type MiniGameSummary,
} from './miniGameRecorder';

/**
 * A round of MeasureWord (GAME_DESIGN.md 6.11): 10 nouns of the table of measure words. Without
 * the table (offline before its first use), or with too few nouns, the game is not eligible.
 */
export async function startMeasureWordSession(
  selection: MiniGameSelection,
  deps: SentenceGameDependencies,
): Promise<MeasureWordSession> {
  const recorder = await openMiniGame('measureWord', selection, deps);
  const resources = await sentenceResourcesOf(deps);
  const table = resources?.measureWords ?? new Map<string, readonly string[]>();
  const imposed = selection.cardIds === undefined ? undefined : new Set(selection.cardIds);
  const nouns = selection.cards.filter(
    (card) => isMeasureWordEligible(card, table) && (imposed === undefined || imposed.has(card.id)),
  );
  const enough = imposed !== undefined || nouns.length >= MINI_GAME_CONFIG.measureWordMinNouns;
  const round = enough
    ? shuffle(nouns, createRng(recorder.id)).slice(0, MINI_GAME_CONFIG.measureWordPerRound)
    : [];
  const questions = round.flatMap((noun, index) => {
    const question = measureWordQuestion(
      noun,
      table,
      { level: recorder.level, seed: `${recorder.id}:${String(index)}` },
      MINI_GAME_CONFIG,
    );
    return question === undefined ? [] : [question];
  });
  return new MeasureWordSession(recorder, questions);
}

export class MeasureWordSession {
  private index = 0;

  constructor(
    private readonly recorder: MiniGameRecorder,
    private readonly questions: readonly MeasureWordQuestion[],
  ) {}

  get current(): MeasureWordQuestion | undefined {
    return this.questions[this.index];
  }

  get eligible(): boolean {
    return this.questions.length > 0;
  }

  get position(): number {
    return this.index;
  }

  get total(): number {
    return this.questions.length;
  }

  /** Never rated by FSRS: the measure word is tested, not the word (GAME_DESIGN.md 6.11). */
  async answer(choice: string | 'unknown'): Promise<Outcome> {
    const question = this.questions[this.index];
    if (question === undefined) {
      throw new Error('The round is over');
    }
    const outcome = measureWordAnswer(question, choice);
    await this.recorder.record({
      card: question.target,
      outcome,
      hintsUsed: 0,
      responseMs: 0,
      ...(choice === 'unknown' ? {} : { answer: choice }),
    });
    this.index += 1;
    if (this.current === undefined) {
      await this.recorder.complete();
    }
    return outcome;
  }

  async quit(): Promise<void> {
    this.index = this.questions.length;
    await this.recorder.quit();
  }

  summary(): MiniGameSummary {
    return this.recorder.summary();
  }

  rewards(): RewardsSummary | undefined {
    return this.recorder.rewards();
  }
}
