import { addDays, type LocalDay } from '../srs/localDay';
import type { EconomyConfig } from './economyConfig';

/** The streak part of the progress (GAME_DESIGN.md 4.4). */
export interface StreakState {
  streakDays: number;
  bestStreak: number;
  /** The last active day counted in the streak. */
  lastStreakDay?: LocalDay;
  /** Missed days covered by a brume day, which freezes the streak. */
  brumeDays: readonly LocalDay[];
}

export interface StreakRoll {
  state: StreakState;
  /** True when a missed day could not be covered: the streak starts again. */
  reset: boolean;
  /** The brume days this roll spent. */
  brumeUsed: LocalDay[];
}

type StreakConfig = Pick<EconomyConfig, 'brumeDaysPerWeek' | 'brumeRetentionDays'>;

const MS_PER_DAY = 86_400_000;

/** The ISO 8601 week of a local day, such as '2026-W45' (weeks run from Monday to Sunday). */
export function isoWeekOf(day: LocalDay): string {
  const date = new Date(`${day}T00:00:00Z`);
  // The Thursday of the same week decides the year the week belongs to.
  const weekday = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date.getTime() + (3 - weekday) * MS_PER_DAY);
  const year = thursday.getUTCFullYear();
  const firstDay = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - firstDay) / MS_PER_DAY / 7) + 1;
  return `${String(year)}-W${String(week).padStart(2, '0')}`;
}

/**
 * Covers the days missed since the last active day with brume days, at most a few per ISO week;
 * a day that cannot be covered starts a new streak. The record is always kept.
 */
export function rollStreak(state: StreakState, today: LocalDay, config: StreakConfig): StreakRoll {
  const { lastStreakDay } = state;
  if (lastStreakDay === undefined || lastStreakDay >= today || state.streakDays === 0) {
    return { state, reset: false, brumeUsed: [] };
  }
  const brumeDays = [...state.brumeDays];
  const brumeUsed: LocalDay[] = [];
  let reset = false;
  for (let day = addDays(lastStreakDay, 1); day < today; day = addDays(day, 1)) {
    if (brumeDays.includes(day)) {
      continue;
    }
    const week = isoWeekOf(day);
    if (brumeDays.filter((brume) => isoWeekOf(brume) === week).length >= config.brumeDaysPerWeek) {
      reset = true;
      break;
    }
    brumeDays.push(day);
    brumeUsed.push(day);
  }
  const oldest = addDays(today, -config.brumeRetentionDays);
  return {
    state: {
      ...state,
      streakDays: reset ? 0 : state.streakDays,
      brumeDays: brumeDays.filter((day) => day >= oldest),
    },
    reset,
    brumeUsed,
  };
}

/** Counts `today` in the streak, once; call rollStreak first. */
export function markActiveDay(state: StreakState, today: LocalDay): StreakState {
  if (state.lastStreakDay !== undefined && state.lastStreakDay >= today) {
    return state;
  }
  const streakDays = state.streakDays + 1;
  return {
    ...state,
    streakDays,
    bestStreak: Math.max(state.bestStreak, streakDays),
    lastStreakDay: today,
  };
}
