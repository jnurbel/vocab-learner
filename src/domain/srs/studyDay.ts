import type { SrsDependencies } from './dependencies';
import { localDay, type LocalDay } from './localDay';

/**
 * The learner's day a session belongs to, fixed when it starts: the local day of `now`, never
 * earlier than the last active day, so that a clock going back takes nothing away
 * (GAME_DESIGN.md 0.3).
 */
export function studyDay(
  now: Date,
  lastActiveDate: LocalDay | undefined,
  { config, timeZone }: Pick<SrsDependencies, 'config' | 'timeZone'>,
): LocalDay {
  const day = localDay(now, config.dayStartHour, timeZone);
  return lastActiveDate !== undefined && lastActiveDate > day ? lastActiveDate : day;
}
