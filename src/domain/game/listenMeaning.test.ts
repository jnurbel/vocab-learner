import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { GAME_CONFIG } from '../srs/config';
import { createInitialReviewState, type ReviewState } from '../srs/reviewState';
import {
  listenMeaningAnswer,
  listenMeaningQuestion,
  listenMeaningRound,
  type ListenMeaningQuestion,
} from './listenMeaning';
import { MINI_GAME_CONFIG } from './miniGameConfig';

function word(id: string, translation: string, language: Card['language'] = 'zh'): Card {
  return {
    id,
    language,
    term: id,
    translation,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function reviewed(cardId: string, overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    ...createInitialReviewState(cardId, new Date('2026-11-01T08:00:00Z')),
    reps: 3,
    stability: 5,
    successDays: 2,
    state: 'review',
    peakStage: 'stem',
    ...overrides,
  };
}

const cards = ['chat', 'chien', 'oiseau', 'poisson', 'cheval', 'vache'].map((meaning, index) =>
  word(`w${String(index)}`, meaning),
);
const states = cards.map(({ id }) => reviewed(id));

describe('a round of ListenMeaning', () => {
  it('asks the words of a language already introduced, in an order drawn from the seed', () => {
    const round = listenMeaningRound(
      [...cards, word('apple', 'pomme', 'en'), word('new', 'nouveau')],
      states,
      'zh',
      { seed: 'r1', size: 10 },
    );

    expect(round.map(({ id }) => id).sort()).toEqual(cards.map(({ id }) => id).sort());
    expect(listenMeaningRound(cards, states, 'zh', { seed: 'r1', size: 10 })).toEqual(
      listenMeaningRound(cards, states, 'zh', { seed: 'r1', size: 10 }),
    );
  });

  it('asks at most the size of the round', () => {
    expect(listenMeaningRound(cards, states, 'zh', { seed: 'r1', size: 4 })).toHaveLength(4);
  });

  it('asks new words too when too few were introduced', () => {
    expect(listenMeaningRound(cards, [], 'zh', { seed: 'r1', size: 10 })).toHaveLength(6);
  });
});

describe('a question of ListenMeaning (GAME_DESIGN.md 6.1)', () => {
  const pool = { cards, introduced: new Set(cards.map(({ id }) => id)) };

  it('offers 4 meanings at level 2, the right one among them, each once', () => {
    const question = listenMeaningQuestion(
      cards[0]!,
      pool,
      { level: 2, stage: 'stem', seed: 's1' },
      MINI_GAME_CONFIG,
    );

    expect(question?.difficulty).toBe(2);
    expect(question?.options).toHaveLength(4);
    expect(question?.options).toContain(cards[0]);
    expect(new Set(question?.options).size).toBe(4);
  });

  it('offers 3 meanings at level 1, and caps a young word at level 2', () => {
    const easy = { level: 1 as const, stage: 'stem' as const, seed: 's1' };
    const young = { level: 3 as const, stage: 'sprout' as const, seed: 's1' };

    expect(listenMeaningQuestion(cards[0]!, pool, easy, MINI_GAME_CONFIG)?.options).toHaveLength(3);
    expect(listenMeaningQuestion(cards[0]!, pool, young, MINI_GAME_CONFIG)?.difficulty).toBe(2);
  });

  it('puts the right meaning at different places from one seed to another', () => {
    const places = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        listenMeaningQuestion(
          cards[0]!,
          pool,
          { level: 2, stage: 'stem', seed: String(seed) },
          MINI_GAME_CONFIG,
        )?.options.indexOf(cards[0]!),
      ),
    );

    expect(places.size).toBeGreaterThan(1);
  });

  it('is not eligible for the only word of a language', () => {
    const alone = { cards: [cards[0]!], introduced: new Set<string>() };

    expect(
      listenMeaningQuestion(
        cards[0]!,
        alone,
        { level: 2, stage: 'stem', seed: 's' },
        MINI_GAME_CONFIG,
      ),
    ).toBeUndefined();
  });
});

describe('the answer to a question', () => {
  const question: ListenMeaningQuestion = {
    target: cards[0]!,
    options: [cards[1]!, cards[0]!, cards[2]!],
    difficulty: 1,
  };
  const quick = { hintsUsed: 0, responseMs: 2000 };

  it('rates a quick right choice good', () => {
    expect(listenMeaningAnswer(question, cards[0]!, quick, GAME_CONFIG)).toEqual({
      outcome: 'correct',
      rating: 'good',
    });
  });

  it('rates a right choice after 8 seconds hard', () => {
    expect(
      listenMeaningAnswer(question, cards[0]!, { hintsUsed: 0, responseMs: 8001 }, GAME_CONFIG),
    ).toEqual({ outcome: 'correct', rating: 'hard' });
  });

  it('rates a right choice after the written hint hard, as correct with hint', () => {
    expect(
      listenMeaningAnswer(question, cards[0]!, { hintsUsed: 1, responseMs: 1000 }, GAME_CONFIG),
    ).toEqual({ outcome: 'correctWithHint', rating: 'hard' });
  });

  it('rates a wrong choice and "I do not know" again', () => {
    expect(listenMeaningAnswer(question, cards[1]!, quick, GAME_CONFIG)).toEqual({
      outcome: 'wrong',
      rating: 'again',
    });
    expect(listenMeaningAnswer(question, 'unknown', quick, GAME_CONFIG).outcome).toBe('wrong');
  });

  it('refuses a choice that was not offered', () => {
    expect(() => listenMeaningAnswer(question, cards[5]!, quick, GAME_CONFIG)).toThrow(
      'Not an option of this question',
    );
  });
});
