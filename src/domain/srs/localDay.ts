/** A local calendar day, 'YYYY-MM-DD'. */
export type LocalDay = string;

const MS_PER_DAY = 86_400_000;

/**
 * The learner's day containing `date`: it starts at `rolloverHour` local time, so that an answer
 * at 00:30 still counts for the previous evening. `timeZone` (IANA name) defaults to the device's.
 */
export function localDay(date: Date, rolloverHour = 4, timeZone?: string): LocalDay {
  if (!Number.isInteger(rolloverHour) || rolloverHour < 0 || rolloverHour > 23) {
    throw new RangeError(`Invalid rollover hour: ${String(rolloverHour)}`);
  }
  const wallClock = wallClockParts(date, timeZone);
  // Shift the wall-clock calendar date in UTC arithmetic, which has no daylight saving.
  const dayStart = Date.UTC(wallClock.year, wallClock.month - 1, wallClock.day);
  const shift = wallClock.hour < rolloverHour ? MS_PER_DAY : 0;
  return new Date(dayStart - shift).toISOString().slice(0, 10);
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
}

/** Throws RangeError for an invalid date or an unknown time zone. */
function wallClockParts(date: Date, timeZone: string | undefined): WallClock {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  });
  const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.get(type));
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour') };
}
