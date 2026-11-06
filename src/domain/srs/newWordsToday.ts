import type { SessionRecord } from '../progressRecords';
import type { SrsDependencies } from './dependencies';
import { localDay, type LocalDay } from './localDay';

/**
 * How many distinct new words the learner discovered on `today` (exercise `discovery`): what is left of the daily quota
 * of new words depends on it.
 */
export function countNewWordsIntroduced(
  sessions: readonly SessionRecord[],
  today: LocalDay,
  { config, timeZone }: Pick<SrsDependencies, 'config' | 'timeZone'>,
): number {
  const discovered = new Set<string>();
  for (const { results } of sessions) {
    for (const { cardId, exercise, at } of results) {
      if (
        exercise === 'discovery' &&
        at !== undefined &&
        localDay(new Date(at), config.dayStartHour, timeZone) === today
      ) {
        discovered.add(cardId);
      }
    }
  }
  return discovered.size;
}
