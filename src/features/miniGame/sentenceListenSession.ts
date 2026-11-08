import type { Card } from '../../domain/card';
import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
import {
  isSentenceListenEligible,
  sentenceListenAnswer,
  sentenceListenQuestion,
  type SentenceListenQuestion,
} from '../../domain/game/sentenceListen';
import { shuffle } from '../../domain/game/shuffle';
import { createRng } from '../../domain/srs/random';
import type { RewardsSummary } from '../game/sessionRewards';
import type { ChoiceRecorded, GivenChoice } from './listenMeaningSession';
import {
  openMiniGame,
  type MiniGameDependencies,
  type MiniGameRecorder,
  type MiniGameSelection,
  type MiniGameSummary,
} from './miniGameRecorder';

/** Sentences in a round: about 2 minutes at 15 seconds an item (GAME_DESIGN.md 6.5). */
export const SENTENCE_LISTEN_ROUND_SIZE = 8;

export async function startSentenceListenSession(
  selection: MiniGameSelection,
  deps: MiniGameDependencies,
): Promise<SentenceListenSession> {
  const recorder = await openMiniGame('sentenceListen', selection, deps);
  const ofLanguage = selection.cards.filter(({ language }) => language === selection.language);
  const imposed = selection.cardIds === undefined ? undefined : new Set(selection.cardIds);
  const eligible = ofLanguage.filter(
    (card) => isSentenceListenEligible(card) && (imposed === undefined || imposed.has(card.id)),
  );
  const introduced = recorder.introducedIds();
  const rng = createRng(recorder.id);
  const round = [
    ...shuffle(
      eligible.filter(({ id }) => introduced.has(id)),
      rng,
    ),
    ...shuffle(
      eligible.filter(({ id }) => !introduced.has(id)),
      rng,
    ),
  ].slice(0, SENTENCE_LISTEN_ROUND_SIZE);
  return new SentenceListenSession(recorder, round, ofLanguage);
}

/**
 * A round of SentenceListen: the example sentence is read, the word heard is chosen among
 * written words. Rated like any choice (GAME_DESIGN.md 6.5).
 */
export class SentenceListenSession {
  private readonly pool;
  private index = 0;
  private question: SentenceListenQuestion | undefined;
  private shownAt = 0;

  constructor(
    private readonly recorder: MiniGameRecorder,
    private readonly round: readonly Card[],
    cards: readonly Card[],
  ) {
    this.pool = { cards, introduced: recorder.introducedIds() };
    this.nextQuestion();
  }

  get current(): SentenceListenQuestion | undefined {
    return this.question;
  }

  /** False without a word whose example sentence can be asked. */
  get eligible(): boolean {
    return this.recorder.summary().answered > 0 || this.question !== undefined;
  }

  get position(): number {
    return this.recorder.summary().answered;
  }

  get total(): number {
    return this.round.length;
  }

  /** The sentence was read to its end: the time to answer starts now, not during the reading. */
  heard(): void {
    this.shownAt = this.recorder.now().getTime();
  }

  async answer(choice: Card | 'unknown', { hintsUsed }: GivenChoice): Promise<ChoiceRecorded> {
    const question = this.question;
    if (question === undefined) {
      throw new Error('The round is over');
    }
    const responseMs = Math.max(0, this.recorder.now().getTime() - this.shownAt);
    const evaluated = sentenceListenAnswer(
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
      ...(choice === 'unknown' ? {} : { answer: choice.term }),
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

  summary(): MiniGameSummary {
    return this.recorder.summary();
  }

  rewards(): RewardsSummary | undefined {
    return this.recorder.rewards();
  }

  /** The next sentence that can be asked; a word without any other word to offer is skipped. */
  private nextQuestion(): void {
    this.question = undefined;
    for (; this.question === undefined && this.index < this.round.length;) {
      const target = this.round[this.index];
      this.question =
        target === undefined
          ? undefined
          : sentenceListenQuestion(
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
