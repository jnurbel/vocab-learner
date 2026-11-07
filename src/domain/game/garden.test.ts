import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { GAME_CONFIG } from '../srs/config';
import type { SrsDependencies } from '../srs/dependencies';
import { createFsrsMemoryModel } from '../srs/fsrsMemoryModel';
import type { ReviewState } from '../srs/reviewState';
import { gardenCounts, gardenPage, gardenPlants } from './garden';

const srs: SrsDependencies = {
  model: createFsrsMemoryModel({ ...GAME_CONFIG.fsrs, enableFuzz: false }),
  config: GAME_CONFIG,
  timeZone: 'Europe/Paris',
};
const moment = { now: new Date('2026-11-07T08:00:00Z'), today: '2026-11-07' };

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    language: 'zh',
    term: id,
    translation: `meaning of ${id}`,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function state(cardId: string, overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    cardId,
    due: '2026-11-20T08:00:00.000Z',
    stability: 25,
    difficulty: 5,
    reps: 6,
    lapses: 0,
    state: 'review',
    lastReviewAt: '2026-11-01T08:00:00.000Z',
    successDays: 4,
    peakStage: 'flower',
    ...overrides,
  };
}

describe('the plants of the garden (GAME_DESIGN.md 8.6)', () => {
  it('draws a word never reviewed as a seed, neither thirsty nor wilted', () => {
    expect(gardenPlants([card('new')], [], moment, srs)).toEqual([
      { card: card('new'), stage: 'seed', currentStage: 'seed', wilted: false, thirst: 0 },
    ]);
  });

  it('sizes a plant by its record, and tells its next review', () => {
    const [plant] = gardenPlants([card('a')], [state('a')], moment, srs);

    expect(plant).toMatchObject({
      stage: 'flower',
      currentStage: 'flower',
      wilted: false,
      thirst: 0,
      nextReview: '2026-11-20',
    });
  });

  it('keeps the size of a plant whose current stage went down, and shows it wilted', () => {
    const lapsed = state('a', { stability: 2, peakStage: 'flower' });

    expect(gardenPlants([card('a')], [lapsed], moment, srs)[0]).toMatchObject({
      stage: 'flower',
      currentStage: 'sprout',
      wilted: true,
    });
  });

  it('shows a word due today as thirsty', () => {
    const due = state('a', { due: '2026-11-06T08:00:00.000Z' });

    expect(gardenPlants([card('a')], [due], moment, srs)[0]?.thirst).toBeGreaterThan(0);
  });

  it('counts the flowers, the lanterns and the thirsty plants', () => {
    const plants = gardenPlants(
      [card('a'), card('b'), card('c'), card('d')],
      [
        state('a'),
        state('b', { peakStage: 'lantern', stability: 70, successDays: 5 }),
        state('c', { due: '2026-11-06T08:00:00.000Z', peakStage: 'bud' }),
      ],
      moment,
      srs,
    );

    expect(gardenCounts(plants)).toEqual({ flowers: 2, lanterns: 1, thirsty: 1 });
  });
});

describe('a page of the garden', () => {
  const many = Array.from({ length: 500 }, (_, index) =>
    card(`w${String(index)}`, {
      language: index % 2 === 0 ? 'zh' : 'en',
      labelIds: index % 5 === 0 ? ['lesson7'] : [],
    }),
  );
  const plants = gardenPlants(many, [], moment, srs);

  it('shows one language, a page at a time, so that 500 words stay fluid', () => {
    const page = gardenPage(plants, { language: 'zh', page: 0, pageSize: 60 });

    expect(page.plants).toHaveLength(60);
    expect(page.plants.every(({ card: { language } }) => language === 'zh')).toBe(true);
    expect(page).toMatchObject({ total: 250, page: 0, pageCount: 5 });
  });

  it('filters by label', () => {
    const page = gardenPage(plants, { language: 'zh', labelId: 'lesson7', page: 0, pageSize: 60 });

    expect(page.total).toBe(50);
    expect(page.pageCount).toBe(1);
  });

  it('keeps the page within the pages that exist', () => {
    expect(gardenPage(plants, { language: 'en', page: 99, pageSize: 60 }).page).toBe(4);
    expect(gardenPage(plants, { language: 'en', page: -3, pageSize: 60 }).page).toBe(0);
  });

  it('has a single empty page for a language without words', () => {
    expect(gardenPage([], { language: 'en', page: 0, pageSize: 60 })).toEqual({
      plants: [],
      total: 0,
      page: 0,
      pageCount: 1,
    });
  });
});
