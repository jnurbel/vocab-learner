import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import { createFsrsMemoryModel } from './fsrsMemoryModel';
import { createInitialReviewState, type ReviewState } from './reviewState';

const model = createFsrsMemoryModel(GAME_CONFIG.fsrs);
const now = new Date('2026-11-06T14:00:00Z');
const DAY_MS = 86_400_000;

function daysUntilDue(state: Pick<ReviewState, 'due'>, from: Date): number {
  return (Date.parse(state.due) - from.getTime()) / DAY_MS;
}

function reviewedState(): ReviewState {
  const initial = createInitialReviewState('card-1', now);
  return { ...initial, ...model.review(initial, 'good', now) };
}

describe('createFsrsMemoryModel', () => {
  it('schedules a new word answered correctly for another day, without short learning steps', () => {
    const update = model.review(createInitialReviewState('card-1', now), 'good', now);

    expect(update.state).toBe('review');
    expect(update.reps).toBe(1);
    expect(update.lapses).toBe(0);
    expect(update.stability).toBeGreaterThan(0);
    expect(update.lastReviewAt).toBe(now.toISOString());
    expect(daysUntilDue(update, now)).toBeGreaterThanOrEqual(1);
  });

  it('brings a forgotten word back no sooner than the next day', () => {
    const update = model.review(createInitialReviewState('card-1', now), 'again', now);

    expect(daysUntilDue(update, now)).toBeGreaterThanOrEqual(1);
  });

  it('counts a lapse and lowers stability when a reviewed word is forgotten', () => {
    const reviewed = reviewedState();
    const later = new Date(reviewed.due);

    const update = model.review(reviewed, 'again', later);

    expect(update.lapses).toBe(1);
    expect(update.reps).toBe(2);
    expect(update.stability).toBeLessThan(reviewed.stability);
  });

  it('waits longer after an easy answer than after a good one, and longer after good than hard', () => {
    const reviewed = reviewedState();
    const later = new Date(reviewed.due);
    const interval = (rating: 'hard' | 'good' | 'easy') =>
      daysUntilDue(model.review(reviewed, rating, later), later);

    expect(interval('easy')).toBeGreaterThan(interval('good'));
    expect(interval('good')).toBeGreaterThan(interval('hard'));
  });

  it('gives the same schedule for the same answer at the same time', () => {
    const reviewed = reviewedState();
    const later = new Date(reviewed.due);

    expect(model.review(reviewed, 'good', later)).toEqual(model.review(reviewed, 'good', later));
  });

  it('leaves the given state untouched', () => {
    const reviewed = reviewedState();
    const snapshot = structuredClone(reviewed);

    model.review(reviewed, 'good', new Date(reviewed.due));

    expect(reviewed).toEqual(snapshot);
  });

  it('estimates a recall probability that fades with time since the last review', () => {
    const reviewed = reviewedState();
    const recall = (daysLater: number) =>
      model.retrievability(reviewed, new Date(now.getTime() + daysLater * DAY_MS));

    expect(recall(0)).toBeCloseTo(1, 2);
    expect(recall(1)).toBeLessThan(recall(0));
    expect(recall(30)).toBeLessThan(recall(1));
    expect(recall(30)).toBeGreaterThan(0);
  });

  it('estimates no recall for a word never reviewed', () => {
    expect(model.retrievability(createInitialReviewState('card-1', now), now)).toBe(0);
  });

  it('keeps the interval within the configured maximum', () => {
    const shortCap = createFsrsMemoryModel({ ...GAME_CONFIG.fsrs, maximumIntervalDays: 5 });
    const reviewed = reviewedState();
    const later = new Date(reviewed.due);

    expect(daysUntilDue(model.review(reviewed, 'good', later), later)).toBeGreaterThan(5);
    expect(daysUntilDue(shortCap.review(reviewed, 'good', later), later)).toBeLessThanOrEqual(5);
  });
});
