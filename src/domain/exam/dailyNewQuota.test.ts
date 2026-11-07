import { describe, expect, it } from 'vitest';
import { dailyNewQuota, type NewQuotaInput } from './dailyNewQuota';
import { EXAM_CONFIG } from './examConfig';
import { focusLabel, reviewed, words } from './exam.fixtures';

const today = '2026-11-06';

function quota(overrides: Partial<NewQuotaInput>): number {
  return dailyNewQuota(
    { cards: [], states: [], labels: [], today, newPerDay: 5, ...overrides },
    EXAM_CONFIG,
  );
}

describe('dailyNewQuota', () => {
  it('follows the setting when no pinned label has a test', () => {
    expect(quota({ cards: words('l', 30), labels: [focusLabel('l')], newPerDay: 8 })).toBe(8);
  });

  it('spreads 25 words over the 6 days before a test in 7 days, keeping a reserve day', () => {
    const labels = [focusLabel('l', '2026-11-13')];

    expect(quota({ cards: words('l', 25), labels, newPerDay: 3 })).toBe(5);
  });

  it('keeps the setting when it already introduces the words fast enough', () => {
    const labels = [focusLabel('l', '2026-11-13')];

    expect(quota({ cards: words('l', 25), labels, newPerDay: 10 })).toBe(10);
  });

  it('keeps no reserve day with less than 3 days left', () => {
    const labels = [focusLabel('l', '2026-11-08')];

    expect(quota({ cards: words('l', 25), labels, newPerDay: 3 })).toBe(13);
  });

  it('introduces every new word the day before the test, up to 20', () => {
    const labels = [focusLabel('l', '2026-11-07')];

    expect(quota({ cards: words('l', 18), labels })).toBe(18);
    expect(quota({ cards: words('l', 30), labels })).toBe(20);
  });

  it('caps 500 words before a test in 7 days at 20 a day, or 30 in intensive mode', () => {
    const labels = [focusLabel('l', '2026-11-13')];
    const cards = words('l', 500);

    expect(quota({ cards, labels })).toBe(20);
    expect(quota({ cards, labels, intensiveLabelIds: ['l'] })).toBe(30);
  });

  it('ignores the intensive mode of a label without an upcoming test', () => {
    const cards = words('l', 500);

    expect(
      quota({
        cards,
        labels: [focusLabel('l', '2026-11-13'), focusLabel('other')],
        intensiveLabelIds: ['other'],
      }),
    ).toBe(20);
  });

  it('introduces no word for a test today: the quota falls back to the setting', () => {
    expect(quota({ cards: words('l', 25), labels: [focusLabel('l', today)] })).toBe(5);
  });

  it('ignores a test date on a label that is not pinned', () => {
    const labels = [focusLabel('l', '2026-11-07', { isFocus: false })];

    expect(quota({ cards: words('l', 18), labels })).toBe(5);
  });

  it('counts only the words never reviewed', () => {
    const cards = words('l', 18);
    const states = cards.slice(0, 10).map(({ id }) => reviewed(id, '2026-11-10T08:00:00Z'));

    expect(quota({ cards, states, labels: [focusLabel('l', '2026-11-07')] })).toBe(8);
  });

  it('counts once a word shared by two labels with tests, for the nearest test', () => {
    const shared = words('s', 6, ['near', 'far']);
    const labels = [focusLabel('near', '2026-11-07'), focusLabel('far', '2026-11-13')];
    const cards = [...shared, ...words('f', 6, ['far'])];

    // near: 6 words the day before; far: its own 6 words over 6 days.
    expect(quota({ cards, labels, newPerDay: 1 })).toBe(7);
  });

  it('does not count the new words of the other labels in the test quota', () => {
    const labels = [focusLabel('l', '2026-11-07')];

    expect(quota({ cards: [...words('l', 6), ...words('other', 40)], labels, newPerDay: 1 })).toBe(
      6,
    );
  });

  it('adds the quotas of several tests, under the same daily cap', () => {
    const labels = [focusLabel('a', '2026-11-07'), focusLabel('b', '2026-11-07')];
    const cards = [...words('a', 8), ...words('b', 8)];

    expect(quota({ cards, labels })).toBe(16);
    expect(quota({ cards: [...words('a', 15), ...words('b', 15)], labels })).toBe(20);
  });

  it('keeps a setting above the daily cap: the learner chose it', () => {
    const labels = [focusLabel('l', '2026-11-13')];

    expect(quota({ cards: words('l', 500), labels, newPerDay: 30 })).toBe(30);
  });

  it('allows no new word when there is none left', () => {
    const cards = words('l', 3);
    const states = cards.map(({ id }) => reviewed(id, '2026-11-10T08:00:00Z'));

    expect(quota({ cards, states, labels: [focusLabel('l', '2026-11-13')] })).toBe(0);
    expect(quota({})).toBe(0);
  });
});
