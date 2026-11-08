import type { Card } from '../../domain/card';
import { difficultyFor } from '../../domain/game/adaptiveDifficulty';
import {
  bridgeBoard,
  bridgePairResult,
  bridgeRound,
  bridgeVariant,
  type BridgeBoard,
  type BridgeRound,
} from '../../domain/game/bridgeMatch';
import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
import type { Outcome } from '../../domain/srs/reviewState';
import type { RewardsSummary } from '../game/sessionRewards';
import {
  openMiniGame,
  type MiniGameDependencies,
  type MiniGameRecorder,
  type MiniGameSelection,
  type MiniGameSummary,
} from './miniGameRecorder';

export interface BridgeMatchSelection extends MiniGameSelection {
  /** False without a voice for the language: the boards show written words only. */
  voice: boolean;
}

export type LinkResult =
  | { kind: 'mismatch' }
  | {
      kind: 'match';
      outcome: Outcome;
      /** False when the word was already rated today: its memory was left untouched. */
      rated: boolean;
    };

export async function startBridgeMatchSession(
  selection: BridgeMatchSelection,
  deps: MiniGameDependencies,
): Promise<BridgeMatchSession> {
  const recorder = await openMiniGame('bridgeMatch', selection, deps);
  const chosen = selection.cards.filter(
    (card) =>
      selection.labelIds.length === 0 ||
      card.labelIds.some((id) => selection.labelIds.includes(id)),
  );
  const round = bridgeRound(chosen, recorder.introducedIds(), selection.language, {
    seed: recorder.id,
    ...(selection.cardIds === undefined ? {} : { cardIds: selection.cardIds }),
  });
  return new BridgeMatchSession(recorder, round, selection.voice);
}

/** A round of BridgeMatch: two boards; each pair found is stored at once (GAME_DESIGN.md 6.4). */
export class BridgeMatchSession {
  private current: BridgeBoard | undefined;
  private boards = 0;
  private readonly used = new Set<string>();
  private readonly found = new Set<string>();
  private readonly missed = new Set<string>();
  private lastFoundAt = 0;

  constructor(
    private readonly recorder: MiniGameRecorder,
    private readonly round: BridgeRound,
    private readonly voice: boolean,
  ) {
    this.nextBoard();
  }

  /** The board to play, or undefined once the round is over. */
  get board(): BridgeBoard | undefined {
    return this.current;
  }

  /** The words of the current board already linked. */
  get matched(): ReadonlySet<string> {
    return this.found;
  }

  /** 1 for the first board. */
  get boardNumber(): number {
    return this.boards;
  }

  /** False when the words cannot fill a board: too few, or all in conflict. */
  get eligible(): boolean {
    return this.recorder.summary().answered > 0 || this.current !== undefined;
  }

  /** Links a word of the left bank to a card of the right bank, given by their word ids. */
  async link(leftId: string, rightId: string): Promise<LinkResult> {
    const board = this.current;
    const word = board?.left.find(({ id }) => id === leftId);
    if (
      board === undefined ||
      word === undefined ||
      !board.right.some(({ id }) => id === rightId)
    ) {
      throw new Error('Not on the board');
    }
    if (leftId !== rightId) {
      this.missed.add(leftId);
      this.missed.add(rightId);
      return { kind: 'mismatch' };
    }
    const now = this.recorder.now().getTime();
    const responseMs = Math.max(0, now - this.lastFoundAt);
    const { outcome, rating } = bridgePairResult(
      { missed: this.missed.has(leftId), responseMs },
      this.recorder.srsConfig,
    );
    const { rated } = await this.recorder.record({
      card: word,
      outcome,
      rating,
      hintsUsed: 0,
      responseMs,
    });
    this.found.add(leftId);
    this.lastFoundAt = this.recorder.now().getTime();
    if (this.found.size === board.left.length) {
      await this.boardDone();
    }
    return { kind: 'match', outcome, rated };
  }

  /** Leaves early: the pairs found are already stored. */
  async quit(): Promise<void> {
    this.current = undefined;
    await this.recorder.quit();
  }

  summary(): MiniGameSummary {
    return this.recorder.summary();
  }

  rewards(): RewardsSummary | undefined {
    return this.recorder.rewards();
  }

  private async boardDone(): Promise<void> {
    this.nextBoard();
    if (this.current === undefined) {
      await this.recorder.complete();
    }
  }

  private nextBoard(): void {
    this.current = undefined;
    this.found.clear();
    this.missed.clear();
    const remaining = this.round.targets.filter(({ id }) => !this.used.has(id));
    if (this.boards >= MINI_GAME_CONFIG.bridgeBoardsPerRound || remaining.length === 0) {
      return;
    }
    const [first] = remaining;
    const level = first === undefined ? this.recorder.level : this.levelFor(first);
    const variant = bridgeVariant(
      level,
      first?.language ?? 'zh',
      { voice: this.voice },
      MINI_GAME_CONFIG,
    );
    const settings = { seed: `${this.recorder.id}:${String(this.boards)}`, close: level === 3 };
    const played = this.round.targets.filter(({ id }) => this.used.has(id));
    const board =
      bridgeBoard(remaining, this.round.others, variant, settings, MINI_GAME_CONFIG) ??
      bridgeBoard(
        remaining,
        [...this.round.others, ...played],
        variant,
        settings,
        MINI_GAME_CONFIG,
      );
    if (board === undefined) {
      return;
    }
    board.left.forEach(({ id }) => this.used.add(id));
    this.boards += 1;
    this.current = board;
    this.lastFoundAt = this.recorder.now().getTime();
  }

  private levelFor(card: Card) {
    return difficultyFor(this.recorder.level, this.recorder.stageOf(card), MINI_GAME_CONFIG);
  }
}
