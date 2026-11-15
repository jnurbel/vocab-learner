import type { Card } from '../../domain/card';
import { compareAnswer, type Comparison } from '../../domain/dictation/answerCompare';
import {
  gapFillChoiceAnswer,
  gapFillQuestion,
  gapFillSentenceOf,
  gapFillTypedOutcome,
  type BankLookup,
  type GapFillQuestion,
  type GapFillResult,
} from '../../domain/game/gapFill';
import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
import { shuffle } from '../../domain/game/shuffle';
import type { PinyinGenerator } from '../../domain/pinyinGeneration';
import { createRng } from '../../domain/srs/random';
import { bankLookupFor, type SentenceResources } from '../../services/sentence/sentenceLoader';
import type { RewardsSummary } from '../game/sessionRewards';
import {
  openMiniGame,
  type MiniGameDependencies,
  type MiniGameRecorder,
  type MiniGameSelection,
  type MiniGameSummary,
} from './miniGameRecorder';

export interface SentenceGameDependencies extends MiniGameDependencies {
  /** The sentence data of the app; without it, or offline, only the learner's examples. */
  loadSentences?: () => Promise<SentenceResources>;
}

export interface GapFillDependencies extends SentenceGameDependencies {
  /** pinyin-pro, loaded only to explain a typed word of the same sound. */
  loadPinyin: () => Promise<PinyinGenerator>;
}

export interface GapFillRecorded extends GapFillResult {
  rated: boolean;
  /** For a typed word: the comparison with the expected one. */
  comparison?: Comparison;
}

/** The sentence data, or none when it cannot be loaded: the examples are asked anyway. */
export async function sentenceResourcesOf(
  deps: SentenceGameDependencies,
): Promise<SentenceResources | undefined> {
  try {
    return await deps.loadSentences?.();
  } catch {
    return undefined;
  }
}

/** A round of GapFill (GAME_DESIGN.md 6.10): 6 sentences, the words already met first. */
export async function startGapFillSession(
  selection: MiniGameSelection,
  deps: GapFillDependencies,
): Promise<GapFillSession> {
  const recorder = await openMiniGame('gapFill', selection, deps);
  const resources = selection.language === 'zh' ? await sentenceResourcesOf(deps) : undefined;
  const bank = resources === undefined ? undefined : bankLookupFor(resources, selection.cards);
  const ofLanguage = selection.cards.filter(({ language }) => language === selection.language);
  const imposed = selection.cardIds === undefined ? undefined : new Set(selection.cardIds);
  const asked = ofLanguage.filter((card) => imposed === undefined || imposed.has(card.id));
  const introduced = recorder.introducedIds();
  const rng = createRng(recorder.id);
  const ordered = [
    ...shuffle(
      asked.filter(({ id }) => introduced.has(id)),
      rng,
    ),
    ...shuffle(
      asked.filter(({ id }) => !introduced.has(id)),
      rng,
    ),
  ];
  return new GapFillSession(recorder, ordered, ofLanguage, bank, deps);
}

/** A round of GapFill: a sentence with a gap, a word to choose or to type. */
export class GapFillSession {
  private readonly pool;
  private readonly questions: GapFillQuestion[];
  private index = 0;
  private shownAt = 0;

  constructor(
    private readonly recorder: MiniGameRecorder,
    words: readonly Card[],
    cards: readonly Card[],
    bank: BankLookup | undefined,
    private readonly deps: GapFillDependencies,
  ) {
    this.pool = { cards, introduced: recorder.introducedIds() };
    this.questions = words
      .flatMap((target, index) => {
        const seed = `${recorder.id}:${String(index)}`;
        const sentence = gapFillSentenceOf(target, bank, seed);
        return sentence === undefined
          ? []
          : [
              gapFillQuestion(
                target,
                sentence,
                this.pool,
                { level: recorder.level, stage: recorder.stageOf(target), seed },
                MINI_GAME_CONFIG,
              ),
            ];
      })
      .slice(0, MINI_GAME_CONFIG.gapFillPerRound);
    this.shownAt = recorder.now().getTime();
  }

  get current(): GapFillQuestion | undefined {
    return this.questions[this.index];
  }

  /** False without a word that a sentence can ask. */
  get eligible(): boolean {
    return this.questions.length > 0;
  }

  get position(): number {
    return this.index;
  }

  get total(): number {
    return this.questions.length;
  }

  async answerChoice(choice: Card | 'unknown', hintsUsed: number): Promise<GapFillRecorded> {
    const question = this.asked();
    const responseMs = Math.max(0, this.recorder.now().getTime() - this.shownAt);
    const result = gapFillChoiceAnswer(
      question,
      choice,
      { hintsUsed, responseMs },
      this.recorder.srsConfig,
    );
    return this.record(
      question,
      result,
      hintsUsed,
      responseMs,
      choice === 'unknown' ? undefined : choice.term,
    );
  }

  /** A typed word, compared as in the dictation; an empty answer is "I don't know". */
  async answerTyped(given: string, hintsUsed: number): Promise<GapFillRecorded> {
    const question = this.asked();
    const comparison = await compareAnswer(
      { language: question.target.language, expected: question.target.term, given },
      { loadPinyin: this.deps.loadPinyin },
    );
    const result = gapFillTypedOutcome(comparison.outcome, hintsUsed);
    const recorded = await this.record(question, result, hintsUsed, 0, given);
    return { ...recorded, comparison };
  }

  /** Leaves early: the answers given are already stored. */
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

  private asked(): GapFillQuestion {
    const question = this.current;
    if (question === undefined) {
      throw new Error('The round is over');
    }
    return question;
  }

  private async record(
    question: GapFillQuestion,
    result: GapFillResult,
    hintsUsed: number,
    responseMs: number,
    answer: string | undefined,
  ): Promise<GapFillRecorded> {
    const { rated } = await this.recorder.record({
      card: question.target,
      outcome: result.outcome,
      rating: result.rating,
      hintsUsed,
      responseMs,
      ...(answer === undefined ? {} : { answer }),
    });
    this.index += 1;
    this.shownAt = this.recorder.now().getTime();
    if (this.current === undefined) {
      await this.recorder.complete();
    }
    return { ...result, rated };
  }
}
