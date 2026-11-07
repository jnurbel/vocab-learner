import { describe, expect, it } from 'vitest';
import { daysUntil, nearestUpcomingExam } from './examCalendar';
import { card, focusLabel } from './exam.fixtures';

describe('daysUntil', () => {
  it('counts whole calendar days, the test day excluded', () => {
    expect(daysUntil('2026-11-13', '2026-11-06')).toBe(7);
    expect(daysUntil('2026-11-06', '2026-11-06')).toBe(0);
    expect(daysUntil('2026-11-05', '2026-11-06')).toBe(-1);
  });

  it('is not fooled by a daylight saving change', () => {
    expect(daysUntil('2026-10-26', '2026-10-24')).toBe(2);
  });
});

describe('nearestUpcomingExam', () => {
  const labels = [
    focusLabel('far', '2026-11-20'),
    focusLabel('near', '2026-11-10'),
    focusLabel('past', '2026-11-01'),
    focusLabel('unpinned', '2026-11-08', { isFocus: false }),
    focusLabel('undated'),
  ];
  const today = '2026-11-06';

  it('takes the nearest test to come among the pinned labels of the word', () => {
    expect(nearestUpcomingExam(card('w', ['far', 'near', 'unpinned']), labels, today)).toBe(
      '2026-11-10',
    );
  });

  it('counts a test today as upcoming', () => {
    expect(nearestUpcomingExam(card('w', ['near']), labels, '2026-11-10')).toBe('2026-11-10');
  });

  it('has none for a word without a pinned label with a test to come', () => {
    expect(
      nearestUpcomingExam(card('w', ['past', 'unpinned', 'undated', 'gone']), labels, today),
    ).toBeUndefined();
  });
});
