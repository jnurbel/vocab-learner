import { describe, expect, it } from 'vitest';
import type { Card, Language } from '../card';
import { EXAM_CONFIG } from '../exam/examConfig';
import { focusLabel } from '../exam/exam.fixtures';
import type { Label } from '../label';
import { GAME_CONFIG } from './config';
import { buildReviewQueue, type ReviewQueueInput } from './reviewQueue';
import { createInitialReviewState, type ReviewState } from './reviewState';

const srs = { config: GAME_CONFIG, timeZone: 'Europe/Paris' };
const now = new Date('2026-11-06T14:00:00Z');
const today = '2026-11-06';

function card(
  id: string,
  options: { language?: Language; labelIds?: string[]; createdAt?: string } = {},
): Card {
  return {
    id,
    language: options.language ?? 'zh',
    term: id,
    translation: id,
    labelIds: options.labelIds ?? [],
    source: 'manual',
    createdAt: options.createdAt ?? '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function reviewed(cardId: string, due: string, extra: Partial<ReviewState> = {}): ReviewState {
  return {
    ...createInitialReviewState(cardId, new Date('2026-10-01T00:00:00Z')),
    reps: 3,
    stability: 5,
    state: 'review',
    due,
    lastRatedDay: '2026-10-30',
    ...extra,
  };
}

function queue(overrides: Partial<ReviewQueueInput>) {
  const input: ReviewQueueInput = {
    cards: [],
    states: [],
    now,
    today,
    newPerDay: 5,
    newIntroducedToday: 0,
    language: 'zh',
    seed: 'session-1',
    ...overrides,
  };
  return buildReviewQueue(input, srs);
}

const ids = (items: readonly { card: Card }[]) => items.map((item) => item.card.id);

describe('buildReviewQueue', () => {
  it('lists the words due today, the most overdue first', () => {
    const items = queue({
      cards: [card('a'), card('b'), card('c')],
      states: [
        reviewed('a', '2026-11-05T08:00:00Z'),
        reviewed('b', '2026-10-20T08:00:00Z'),
        reviewed('c', '2026-11-06T20:00:00Z'),
      ],
    });

    expect(ids(items)).toEqual(['b', 'a', 'c']);
    expect(items.every((item) => item.kind === 'review')).toBe(true);
  });

  it('leaves out the words due on a later day', () => {
    // 04:00 on 7 November in Paris starts the next local day.
    const items = queue({
      cards: [card('soon'), card('tonight')],
      states: [
        reviewed('soon', '2026-11-07T03:00:00Z'),
        reviewed('tonight', '2026-11-07T02:59:00Z'),
      ],
    });

    expect(ids(items)).toEqual(['tonight']);
  });

  it('leaves out the words already rated today', () => {
    const items = queue({
      cards: [card('done')],
      states: [reviewed('done', '2026-11-05T08:00:00Z', { lastRatedDay: today })],
    });

    expect(items).toEqual([]);
  });

  it('adds new words after the reviews, the earliest added first, up to the daily quota left', () => {
    const items = queue({
      cards: [
        card('new-late', { createdAt: '2026-11-03T00:00:00Z' }),
        card('due'),
        card('new-early', { createdAt: '2026-11-01T00:00:00Z' }),
        card('new-middle', { createdAt: '2026-11-02T00:00:00Z' }),
      ],
      states: [reviewed('due', '2026-11-05T08:00:00Z')],
      newPerDay: 5,
      newIntroducedToday: 3,
    });

    expect(ids(items)).toEqual(['due', 'new-early', 'new-middle']);
    expect(items.map((item) => item.kind)).toEqual(['review', 'new', 'new']);
  });

  it('gives a new word a fresh state due now, or keeps the one it already has', () => {
    const existing = createInitialReviewState('kept', new Date('2026-11-01T00:00:00Z'));

    const items = queue({ cards: [card('fresh'), card('kept')], states: [existing] });

    expect(items.find((item) => item.card.id === 'fresh')?.state).toEqual(
      createInitialReviewState('fresh', now),
    );
    expect(items.find((item) => item.card.id === 'kept')?.state).toBe(existing);
  });

  it('adds no new word once the daily quota is used up', () => {
    const cards = [card('n1'), card('n2')];

    expect(queue({ cards, newPerDay: 5, newIntroducedToday: 5 })).toEqual([]);
    expect(queue({ cards, newPerDay: 5, newIntroducedToday: 7 })).toEqual([]);
    expect(queue({ cards, newPerDay: 0 })).toEqual([]);
  });

  it('adds no new word for a malformed quota', () => {
    const cards = [card('n1'), card('n2')];

    for (const newPerDay of [-3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(queue({ cards, newPerDay })).toEqual([]);
    }
    expect(queue({ cards, newIntroducedToday: Number.NaN })).toEqual([]);
    expect(ids(queue({ cards, newPerDay: 1.9 }))).toHaveLength(1);
  });

  it('keeps to one language', () => {
    const items = queue({
      cards: [card('猫'), card('cat', { language: 'en' })],
      language: 'en',
    });

    expect(ids(items)).toEqual(['cat']);
  });

  it('keeps to the chosen labels, each word once', () => {
    const items = queue({
      cards: [
        card('cat', { labelIds: ['animals', 'lesson-3'] }),
        card('book', { labelIds: ['lesson-3'] }),
        card('dog', { labelIds: ['animals'] }),
      ],
      labelIds: ['animals', 'lesson-3'],
    });

    expect(ids(items).sort()).toEqual(['book', 'cat', 'dog']);
    expect(
      ids(queue({ cards: [card('book', { labelIds: ['lesson-3'] })], labelIds: ['animals'] })),
    ).toEqual([]);
  });

  it('ignores the states of words that no longer exist', () => {
    expect(queue({ states: [reviewed('deleted', '2026-11-01T08:00:00Z')] })).toEqual([]);
  });

  it('orders words due at the same time the same way for the same seed, whatever the input order', () => {
    const due = '2026-11-05T08:00:00Z';
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => card(id));
    const states = cards.map((each) => reviewed(each.id, due));

    const first = ids(queue({ cards, states }));
    const reversed = ids(queue({ cards: [...cards].reverse(), states: [...states].reverse() }));

    expect(reversed).toEqual(first);
  });

  it('shuffles ties differently with another seed', () => {
    const cards = Array.from({ length: 12 }, (_, index) => card(`word-${String(index)}`));
    const orders = new Set(
      ['s1', 's2', 's3', 's4'].map((seed) => ids(queue({ cards, newPerDay: 20, seed })).join()),
    );

    expect(orders.size).toBeGreaterThan(1);
  });

  it('returns an empty queue when there is nothing to do', () => {
    expect(queue({})).toEqual([]);
  });
});

describe('buildReviewQueue with labels to work on', () => {
  const exam = '2026-11-13';
  const labels: Label[] = [
    focusLabel('exam', exam),
    focusLabel('soon', '2026-11-09'),
    focusLabel('pinned'),
    focusLabel('today', today),
  ];
  const focus = { labels, exam: EXAM_CONFIG };
  const due = (cardId: string, at = '2026-11-05T08:00:00Z', extra: Partial<ReviewState> = {}) =>
    reviewed(cardId, at, extra);

  it('puts first the words of a label with a test, then the pinned ones, the new ones, the others', () => {
    const items = queue({
      cards: [
        card('other'),
        card('pinned-word', { labelIds: ['pinned'] }),
        card('exam-word', { labelIds: ['exam'] }),
        card('new-word', { labelIds: ['exam'] }),
      ],
      states: [
        due('other', '2026-10-01T08:00:00Z'),
        due('pinned-word', '2026-10-02T08:00:00Z'),
        due('exam-word'),
      ],
      focus,
    });

    expect(ids(items)).toEqual(['exam-word', 'pinned-word', 'new-word', 'other']);
  });

  it('serves the nearest test first, then the most overdue word', () => {
    const items = queue({
      cards: [
        card('exam-late', { labelIds: ['exam'] }),
        card('exam-early', { labelIds: ['exam'] }),
        card('soon-word', { labelIds: ['soon'] }),
      ],
      states: [
        due('exam-late', '2026-11-05T08:00:00Z'),
        due('exam-early', '2026-11-01T08:00:00Z'),
        due('soon-word', '2026-11-06T08:00:00Z'),
      ],
      focus,
    });

    expect(ids(items)).toEqual(['soon-word', 'exam-early', 'exam-late']);
  });

  it('asks again inside the 2-day window a word the memory model planned after the test', () => {
    const cards = [card('exam-word', { labelIds: ['exam'] }), card('other')];
    const states = [due('exam-word', '2026-12-01T08:00:00Z'), due('other', '2026-12-01T08:00:00Z')];

    expect(ids(queue({ cards, states, focus, today: '2026-11-10' }))).toEqual([]);
    expect(ids(queue({ cards, states, focus, today: '2026-11-11' }))).toEqual(['exam-word']);
  });

  it('introduces the new words of the pinned labels before any other new word', () => {
    const items = queue({
      cards: [
        card('other-new', { createdAt: '2026-01-01T00:00:00.000Z' }),
        card('pinned-new', { labelIds: ['pinned'] }),
        card('exam-new', { labelIds: ['exam'], createdAt: '2026-11-01T00:00:00.000Z' }),
      ],
      focus,
      newPerDay: 5,
    });

    expect(ids(items)).toEqual(['exam-new', 'pinned-new']);
  });

  it('introduces other new words when no pinned label has any left', () => {
    const items = queue({ cards: [card('other-new')], focus });

    expect(ids(items)).toEqual(['other-new']);
  });

  it('follows the test quota, at most 12 new words in one session', () => {
    const cards = Array.from({ length: 30 }, (_, index) =>
      card(`w${String(index)}`, { labelIds: ['exam'] }),
    );

    expect(queue({ cards, focus, newPerDay: 3 })).toHaveLength(5);
    const crowded = [
      ...cards,
      ...Array.from({ length: 200 }, (_, index) =>
        card(`x${String(index)}`, { labelIds: ['exam'] }),
      ),
    ];
    expect(queue({ cards: crowded, focus, newPerDay: 3 })).toHaveLength(12);
  });

  it('counts the new words already introduced today against the test quota', () => {
    const cards = Array.from({ length: 30 }, (_, index) =>
      card(`w${String(index)}`, { labelIds: ['exam'] }),
    );

    expect(queue({ cards, focus, newPerDay: 3, newIntroducedToday: 4 })).toHaveLength(1);
  });

  it('introduces no new word of a label tested today, but still offers its due words', () => {
    const items = queue({
      cards: [
        card('today-new', { labelIds: ['today'] }),
        card('today-due', { labelIds: ['today'] }),
      ],
      states: [due('today-due')],
      focus,
    });

    expect(ids(items)).toEqual(['today-due']);
  });

  it('still keeps to the chosen labels', () => {
    const items = queue({
      cards: [
        card('exam-word', { labelIds: ['exam'] }),
        card('pinned-word', { labelIds: ['pinned'] }),
      ],
      states: [due('exam-word'), due('pinned-word')],
      focus,
      labelIds: ['pinned'],
    });

    expect(ids(items)).toEqual(['pinned-word']);
  });

  it('orders tied words the same way for the same seed, whatever the input order', () => {
    const cards = Array.from({ length: 6 }, (_, index) =>
      card(`w${String(index)}`, { labelIds: ['exam'] }),
    );
    const states = cards.slice(0, 3).map(({ id }) => due(id));

    const first = ids(queue({ cards, states, focus }));
    const reversed = ids(
      queue({ cards: [...cards].reverse(), states: [...states].reverse(), focus }),
    );

    expect(reversed).toEqual(first);
    expect(first).toHaveLength(6);
  });
});
