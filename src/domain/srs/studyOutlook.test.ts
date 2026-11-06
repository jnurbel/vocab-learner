import { describe, expect, it } from 'vitest';
import type { Card, Language } from '../card';
import { GAME_CONFIG } from './config';
import { createInitialReviewState, type ReviewState } from './reviewState';
import { summarizeStudyOutlook, type StudyOutlookInput } from './studyOutlook';

const srs = { config: GAME_CONFIG, timeZone: 'Europe/Paris' };
const today = '2026-11-06';

function card(id: string, options: { language?: Language; labelIds?: string[] } = {}): Card {
  return {
    id,
    language: options.language ?? 'zh',
    term: id,
    translation: id,
    labelIds: options.labelIds ?? [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

/** A reviewed word falling due at noon (Paris) of `dueDay`, last rated on `ratedDay`. */
function reviewed(cardId: string, dueDay: string, ratedDay = '2026-11-01'): ReviewState {
  return {
    ...createInitialReviewState(cardId, new Date('2026-10-01T00:00:00Z')),
    reps: 2,
    stability: 3,
    state: 'review',
    due: `${dueDay}T11:00:00.000Z`,
    lastRatedDay: ratedDay,
  };
}

function outlook(overrides: Partial<StudyOutlookInput>) {
  return summarizeStudyOutlook(
    {
      cards: [],
      states: [],
      today,
      newPerDay: 5,
      newIntroducedToday: 0,
      language: 'zh',
      ...overrides,
    },
    srs,
  );
}

describe('summarizeStudyOutlook', () => {
  it('counts the words due today and those already reviewed today', () => {
    const result = outlook({
      cards: [card('late'), card('due'), card('done'), card('later')],
      states: [
        reviewed('late', '2026-11-02'),
        reviewed('due', today),
        reviewed('done', '2026-11-09', today),
        reviewed('later', '2026-11-20'),
      ],
    });

    expect(result.dueToday).toBe(2);
    expect(result.reviewedToday).toBe(1);
  });

  it('splits the new words into those still allowed today and those waiting beyond the quota', () => {
    const fresh = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];
    const result = outlook({
      cards: fresh.map((id) => card(id)),
      states: [createInitialReviewState('n1', new Date('2026-11-01T00:00:00Z'))],
      newPerDay: 5,
      newIntroducedToday: 2,
    });

    expect(result.newAvailableToday).toBe(3);
    expect(result.newWaiting).toBe(5);
  });

  it('counts the words to review tomorrow, among those not due today', () => {
    const result = outlook({
      cards: [card('due'), card('a'), card('b'), card('later')],
      states: [
        reviewed('due', today),
        reviewed('a', '2026-11-07', today),
        reviewed('b', '2026-11-07'),
        reviewed('later', '2026-11-09'),
      ],
    });

    expect(result.dueTomorrow).toBe(2);
  });

  it('tells the day and size of the next review when nothing is due today', () => {
    const result = outlook({
      cards: [card('a'), card('b'), card('c')],
      states: [
        reviewed('a', '2026-11-09', today),
        reviewed('b', '2026-11-09'),
        reviewed('c', '2026-11-12'),
      ],
    });

    expect(result.dueToday).toBe(0);
    expect(result.dueTomorrow).toBe(0);
    expect(result.nextReview).toEqual({ day: '2026-11-09', count: 2 });
  });

  it('gives no next review while words are due today, nor when no word was ever reviewed', () => {
    const busy = outlook({
      cards: [card('due'), card('later')],
      states: [reviewed('due', today), reviewed('later', '2026-11-09')],
    });
    const fresh = outlook({ cards: [card('n1')] });

    expect(busy.nextReview).toBeUndefined();
    expect(fresh.nextReview).toBeUndefined();
    expect(fresh).toMatchObject({ dueToday: 0, reviewedToday: 0, dueTomorrow: 0 });
  });

  it('brings a word rated today back tomorrow at the earliest, even if its due date has passed', () => {
    const result = outlook({ cards: [card('a')], states: [reviewed('a', '2026-11-05', today)] });

    expect(result.dueToday).toBe(0);
    expect(result.dueTomorrow).toBe(1);
    expect(result.nextReview).toEqual({ day: '2026-11-07', count: 1 });
  });

  it('only looks at the words of the language and of the chosen labels', () => {
    const result = outlook({
      cards: [
        card('in', { labelIds: ['animals'] }),
        card('out'),
        card('apple', { language: 'en', labelIds: ['animals'] }),
      ],
      states: [reviewed('in', today), reviewed('out', today), reviewed('apple', today)],
      labelIds: ['animals'],
    });

    expect(result.dueToday).toBe(1);
  });

  it('lets no new word in when the quota is used up or malformed, and counts them as waiting', () => {
    const cards = [card('n1'), card('n2')];

    expect(outlook({ cards, newIntroducedToday: 7 })).toMatchObject({
      newAvailableToday: 0,
      newWaiting: 2,
    });
    expect(outlook({ cards, newPerDay: Number.NaN })).toMatchObject({ newAvailableToday: 0 });
    expect(outlook({ cards, newPerDay: -4 })).toMatchObject({ newAvailableToday: 0 });
  });
});
