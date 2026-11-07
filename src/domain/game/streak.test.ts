import { describe, expect, it } from 'vitest';
import { addDays } from '../srs/localDay';
import { ECONOMY_CONFIG } from './economyConfig';
import { isoWeekOf, markActiveDay, rollStreak, type StreakState } from './streak';

const noStreak: StreakState = { streakDays: 0, bestStreak: 0, brumeDays: [] };

/** Plays `days` days from `first`: true is an active day, false a missed one. */
function play(first: string, days: readonly boolean[], start: StreakState = noStreak) {
  let state = start;
  const resets: string[] = [];
  days.forEach((active, offset) => {
    const today = addDays(first, offset);
    if (active) {
      const rolled = rollStreak(state, today, ECONOMY_CONFIG);
      if (rolled.reset) {
        resets.push(today);
      }
      state = markActiveDay(rolled.state, today);
    }
  });
  return { state, resets };
}

const WEEKDAYS = [true, true, true, true, true, false, false];

describe('the ISO week of a day', () => {
  it.each([
    ['2026-11-02', '2026-W45'], // Monday
    ['2026-11-08', '2026-W45'], // Sunday
    ['2026-11-09', '2026-W46'],
    ['2027-01-01', '2026-W53'], // Friday: still in the last week of 2026
    ['2024-12-30', '2025-W01'], // Monday: already in the first week of 2025
  ])('puts %s in week %s', (day, week) => {
    expect(isoWeekOf(day)).toBe(week);
  });
});

describe('the streak (GAME_DESIGN.md 4.4)', () => {
  it('starts at one on the first active day and grows on each consecutive active day', () => {
    const { state } = play('2026-11-02', [true, true, true]);

    expect(state).toMatchObject({ streakDays: 3, bestStreak: 3, lastStreakDay: '2026-11-04' });
  });

  it('counts an active day once, however many times it is marked', () => {
    const once = markActiveDay(noStreak, '2026-11-02');

    expect(markActiveDay(once, '2026-11-02')).toBe(once);
  });

  it('never goes back when the clock shows an earlier day', () => {
    const once = markActiveDay(noStreak, '2026-11-05');

    expect(markActiveDay(once, '2026-11-04')).toBe(once);
    expect(rollStreak(once, '2026-11-04', ECONOMY_CONFIG)).toEqual({
      state: once,
      reset: false,
      brumeUsed: [],
    });
  });

  it('covers a missed day with a brume day, which freezes the streak', () => {
    const { state } = play('2026-11-02', [true, false, true]);

    expect(state).toMatchObject({ streakDays: 2, brumeDays: ['2026-11-03'] });
  });

  it('tells which brume days a roll used', () => {
    const monday = markActiveDay(noStreak, '2026-11-02');

    expect(rollStreak(monday, '2026-11-05', ECONOMY_CONFIG)).toMatchObject({
      reset: false,
      brumeUsed: ['2026-11-03', '2026-11-04'],
    });
  });

  it('uses each brume day once, however many times the day is rolled', () => {
    const monday = markActiveDay(noStreak, '2026-11-02');
    const first = rollStreak(monday, '2026-11-04', ECONOMY_CONFIG).state;

    expect(rollStreak(first, '2026-11-04', ECONOMY_CONFIG)).toEqual({
      state: first,
      reset: false,
      brumeUsed: [],
    });
  });

  it('never resets when absent 2 days every week for 4 weeks (M7)', () => {
    const { state, resets } = play('2026-11-02', [
      ...WEEKDAYS,
      ...WEEKDAYS,
      ...WEEKDAYS,
      ...WEEKDAYS,
    ]);

    expect(resets).toEqual([]);
    expect(state.streakDays).toBe(20);
  });

  it('starts a new streak after 3 days missed in one week, keeping the record (M8)', () => {
    const before = play('2026-10-26', [true, true, true, true, true, true, true]).state;

    const { state, resets } = play('2026-11-02', [true, false, false, false, true], before);

    expect(resets).toEqual(['2026-11-06']);
    expect(state).toMatchObject({ streakDays: 1, bestStreak: 8 });
  });

  it('allows a brume day in each ISO week of a gap across a weekend', () => {
    // Sunday 8 and Monday 9 November are in two different weeks.
    const { resets } = play('2026-11-05', [true, true, false, false, false, true]);

    expect(resets).toEqual([]);
  });

  it('spends no brume day while there is no streak to keep', () => {
    const rolled = rollStreak(noStreak, '2026-11-10', ECONOMY_CONFIG);

    expect(rolled).toEqual({ state: noStreak, reset: false, brumeUsed: [] });
  });

  it('forgets the brume days older than two weeks', () => {
    const old: StreakState = {
      streakDays: 4,
      bestStreak: 4,
      lastStreakDay: '2026-11-20',
      brumeDays: ['2026-11-01', '2026-11-19'],
    };

    expect(rollStreak(old, '2026-11-21', ECONOMY_CONFIG).state.brumeDays).toEqual(['2026-11-19']);
  });
});
