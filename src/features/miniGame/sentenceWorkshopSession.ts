import type { Card } from '../../domain/card';
import type { GapSentence } from '../../domain/game/gapFill';
import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
import {
  canKeepAsExample,
  checkWorkshopSentence,
  hasDetectedError,
  workshopModelSentence,
  type WorkshopCheck,
  type WorkshopResources,
} from '../../domain/game/sentenceWorkshop';
import { shuffle } from '../../domain/game/shuffle';
import { isAtLeast } from '../../domain/srs/stage';
import { createRng } from '../../domain/srs/random';
import {
  bankLookupFor,
  knownWordsFor,
  type SentenceResources,
} from '../../services/sentence/sentenceLoader';
import type { BankLookup } from '../../domain/game/gapFill';
import type { RewardsSummary } from '../game/sessionRewards';
import { sentenceResourcesOf, type SentenceGameDependencies } from './gapFillSession';
import { openMiniGame, type MiniGameRecorder, type MiniGameSelection } from './miniGameRecorder';

export interface WorkshopDependencies extends SentenceGameDependencies {
  /** Saves a learner's sentence as the example of a word ("Garder comme exemple du mot"). */
  keepExample: (card: Card, sentence: string) => Promise<void>;
}

/** A sentence written in the round, for "Faire vérifier mes phrases". */
export interface WrittenSentence {
  term: string;
  sentence: string;
}

/**
 * A round of the sentence workshop (GAME_DESIGN.md 6.12): 3 words, at the stem stage or more
 * when there are some, else any Chinese word; the learner may choose another word of the list.
 * The sentences stay on the device: they are never stored in the history.
 */
export async function startSentenceWorkshopSession(
  selection: MiniGameSelection,
  deps: WorkshopDependencies,
): Promise<SentenceWorkshopSession> {
  const recorder = await openMiniGame('sentenceWorkshop', selection, deps);
  const resources = await sentenceResourcesOf(deps);
  const words = selection.cards.filter(({ language }) => language === 'zh');
  const imposed = selection.cardIds === undefined ? undefined : new Set(selection.cardIds);
  const asked = words.filter((card) => imposed === undefined || imposed.has(card.id));
  const grown = asked.filter((card) => isAtLeast(recorder.stageOf(card), 'stem'));
  const round = shuffle(grown.length > 0 ? grown : asked, createRng(recorder.id)).slice(
    0,
    MINI_GAME_CONFIG.workshopPerRound,
  );
  return new SentenceWorkshopSession(recorder, round, words, resources, deps);
}

export class SentenceWorkshopSession {
  private readonly round: Card[];
  private readonly checker: WorkshopResources | undefined;
  private readonly bank: BankLookup | undefined;
  private index = 0;
  private lastCheck: WorkshopCheck | undefined;
  private readonly written: WrittenSentence[] = [];
  private judged = 0;

  constructor(
    private readonly recorder: MiniGameRecorder,
    round: readonly Card[],
    /** The Chinese words of the learner, to choose from. */
    readonly words: readonly Card[],
    resources: SentenceResources | undefined,
    private readonly deps: WorkshopDependencies,
  ) {
    this.round = [...round];
    this.checker =
      resources === undefined
        ? undefined
        : { rules: resources.rules, known: knownWordsFor(resources, words) };
    this.bank = resources === undefined ? undefined : bankLookupFor(resources, words);
  }

  /** False without a Chinese word, or without the sentence data to check a sentence. */
  get eligible(): boolean {
    return this.round.length > 0 && this.checker !== undefined;
  }

  get current(): Card | undefined {
    return this.round[this.index];
  }

  get position(): number {
    return this.index;
  }

  get total(): number {
    return this.round.length;
  }

  /** The sentences written so far in the round. */
  get sentences(): readonly WrittenSentence[] {
    return this.written;
  }

  /** The learner picks another word of their list for the current sentence. */
  chooseWord(cardId: string): Card | undefined {
    const chosen = this.words.find(({ id }) => id === cardId);
    if (chosen !== undefined && this.index < this.round.length) {
      this.round[this.index] = chosen;
      this.lastCheck = undefined;
    }
    return this.current;
  }

  /** "Vérifier": what can be checked. As often as the learner wants, without penalty. */
  check(sentence: string): WorkshopCheck {
    const card = this.asked();
    if (this.checker === undefined) {
      throw new Error('No sentence data');
    }
    this.lastCheck = checkWorkshopSentence(sentence, card, this.checker);
    return this.lastCheck;
  }

  /** The model sentence with the same word, shown after a check. */
  model(): GapSentence | undefined {
    return workshopModelSentence(
      this.asked(),
      this.bank,
      `${this.recorder.id}:${String(this.index)}`,
    );
  }

  /** Whether the last checked sentence may become the example of the word. */
  get canKeep(): boolean {
    return this.lastCheck !== undefined && canKeepAsExample(this.asked(), this.lastCheck);
  }

  async keepAsExample(): Promise<void> {
    const check = this.lastCheck;
    if (check === undefined || !this.canKeep) {
      throw new Error('This sentence cannot be kept');
    }
    await this.deps.keepExample(this.asked(), check.sentence);
  }

  /**
   * "Ma phrase est juste" or "Je me suis trompé": the sentence earns its points, then the next
   * word comes. Judged right without error found, it hangs a banner.
   */
  async judge(right: boolean): Promise<void> {
    const card = this.asked();
    const check = this.lastCheck;
    if (check === undefined) {
      throw new Error('Check the sentence first');
    }
    await this.recorder.recordEvents([
      {
        type: 'SentenceWritten',
        language: 'zh',
        clean: !hasDetectedError(check),
        judgedRight: right,
      },
    ]);
    this.written.push({ term: card.term, sentence: check.sentence });
    this.judged += 1;
    this.index += 1;
    this.lastCheck = undefined;
  }

  get judgedCount(): number {
    return this.judged;
  }

  rewards(): RewardsSummary | undefined {
    return this.recorder.rewards();
  }

  private asked(): Card {
    const card = this.current;
    if (card === undefined) {
      throw new Error('The round is over');
    }
    return card;
  }
}
