import type { Card } from '../../domain/card';
import { difficultyFor } from '../../domain/game/adaptiveDifficulty';
import { MINI_GAME_CONFIG, type Difficulty } from '../../domain/game/miniGameConfig';
import {
  correctPrefixLength,
  shuffleAnswer,
  shuffleChunks,
  shuffleSentenceOf,
  trapChunk,
} from '../../domain/game/sentenceShuffle';
import { shuffle } from '../../domain/game/shuffle';
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

/** Sentences in a round (GAME_DESIGN.md 6.6). */
export const SENTENCE_SHUFFLE_ROUND_SIZE = 3;
/** A second try is offered after a wrong one (GAME_DESIGN.md 6.6). */
const MAX_TRIES = 2;

export interface ShuffleTile {
  id: string;
  text: string;
  /** The chunk that does not belong to the sentence (level 3). */
  trap: boolean;
}

export interface ShuffleItem {
  target: Card;
  /** The chunks in the order of the sentence. */
  chunks: string[];
  /** The tiles in the order shown, never the order of the sentence. */
  tiles: ShuffleTile[];
  difficulty: Difficulty;
  /** 1, then 2 after a wrong try. */
  attempt: number;
}

export interface ShuffleChecked {
  outcome: Outcome;
  /** The tiles placed right from the start: they stay, the others go back to the reserve. */
  keep: number;
  /** After a wrong try: whether one more try is allowed. */
  canRetry: boolean;
}

export async function startSentenceShuffleSession(
  selection: MiniGameSelection,
  deps: MiniGameDependencies,
): Promise<SentenceShuffleSession> {
  const recorder = await openMiniGame('sentenceShuffle', selection, deps);
  const ofLanguage = selection.cards.filter(({ language }) => language === selection.language);
  const imposed = selection.cardIds === undefined ? undefined : new Set(selection.cardIds);
  const eligible = ofLanguage.filter(
    (card) =>
      shuffleSentenceOf(card, MINI_GAME_CONFIG) !== undefined &&
      (imposed === undefined || imposed.has(card.id)),
  );
  const round = shuffle(eligible, createRng(recorder.id)).slice(0, SENTENCE_SHUFFLE_ROUND_SIZE);
  return new SentenceShuffleSession(recorder, round, ofLanguage);
}

/**
 * A round of SentenceShuffle: put the example sentence back in order. A sentence, not a word:
 * no FSRS rating, only the points and the path (GAME_DESIGN.md 6.6).
 */
export class SentenceShuffleSession {
  private index = 0;
  private item: ShuffleItem | undefined;
  private shownAt = 0;

  constructor(
    private readonly recorder: MiniGameRecorder,
    private readonly round: readonly Card[],
    private readonly cards: readonly Card[],
  ) {
    this.nextItem();
  }

  get current(): ShuffleItem | undefined {
    return this.item;
  }

  /** False without an example sentence of 3 to 8 chunks. */
  get eligible(): boolean {
    return this.index > 0 || this.item !== undefined;
  }

  get position(): number {
    return this.index;
  }

  get total(): number {
    return this.round.length;
  }

  /** Checks the tiles placed, in order. A right sentence is stored at once, a wrong one waits. */
  async check(placedIds: readonly string[]): Promise<ShuffleChecked> {
    const item = this.ongoing();
    const placed = placedIds.map((id) => {
      const tile = item.tiles.find((each) => each.id === id);
      if (tile === undefined) {
        throw new Error('Not a tile');
      }
      return tile.text;
    });
    const outcome = shuffleAnswer(placed, item.chunks, item.target.language, item.attempt);
    if (outcome !== 'wrong') {
      await this.store(item, outcome, placed);
      return { outcome, keep: placed.length, canRetry: false };
    }
    const keep = correctPrefixLength(placed, item.chunks);
    const canRetry = item.attempt < MAX_TRIES;
    if (canRetry) {
      this.item = { ...item, attempt: item.attempt + 1 };
    }
    return { outcome, keep, canRetry };
  }

  /** "J'étais juste": another order may be right too; it counts as right (GAME_DESIGN.md 6.6). */
  async claimRight(): Promise<void> {
    await this.store(this.ongoing(), 'correct', []);
  }

  /** The sentence is left after its tries: stored as missed. */
  async giveUp(): Promise<void> {
    await this.store(this.ongoing(), 'wrong', []);
  }

  /** Leaves early: the sentences done are already stored. */
  async quit(): Promise<void> {
    this.item = undefined;
    await this.recorder.quit();
  }

  summary(): MiniGameSummary {
    return this.recorder.summary();
  }

  rewards(): RewardsSummary | undefined {
    return this.recorder.rewards();
  }

  private ongoing(): ShuffleItem {
    if (this.item === undefined) {
      throw new Error('The round is over');
    }
    return this.item;
  }

  private async store(item: ShuffleItem, outcome: Outcome, placed: readonly string[]) {
    await this.recorder.record({
      card: item.target,
      outcome,
      hintsUsed: item.attempt - 1,
      responseMs: Math.max(0, this.recorder.now().getTime() - this.shownAt),
      ...(placed.length === 0
        ? {}
        : { answer: placed.join(item.target.language === 'en' ? ' ' : '') }),
    });
    this.index += 1;
    this.nextItem();
    if (this.item === undefined) {
      await this.recorder.complete();
    }
  }

  private nextItem(): void {
    this.item = undefined;
    const target = this.round[this.index];
    const chunks = target === undefined ? undefined : shuffleSentenceOf(target, MINI_GAME_CONFIG);
    if (target === undefined || chunks === undefined) {
      return;
    }
    const rng = createRng(`${this.recorder.id}:${String(this.index)}`);
    const difficulty = difficultyFor(
      this.recorder.level,
      this.recorder.stageOf(target),
      MINI_GAME_CONFIG,
    );
    const trap =
      difficulty === 3 ? trapChunk(target, this.cards, chunks, MINI_GAME_CONFIG) : undefined;
    const shuffled = shuffleChunks(chunks, rng).map((text, position) => ({
      id: `chunk-${String(position)}`,
      text,
      trap: false,
    }));
    const tiles =
      trap === undefined
        ? shuffled
        : shuffle([...shuffled, { id: 'trap', text: trap, trap: true }], rng);
    this.item = { target, chunks, tiles, difficulty, attempt: 1 };
    this.shownAt = this.recorder.now().getTime();
  }
}
