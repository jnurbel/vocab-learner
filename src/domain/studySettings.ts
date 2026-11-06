import type { SettingsRecord } from './progressRecords';

/** New words introduced per day unless the learner chose otherwise (GAME_DESIGN.md 0.6). */
export const DEFAULT_NEW_PER_DAY = 5;

export function newPerDayOf(settings: SettingsRecord | undefined): number {
  return settings?.newPerDay ?? DEFAULT_NEW_PER_DAY;
}
