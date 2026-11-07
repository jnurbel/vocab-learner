import { describe, expect, it } from 'vitest';
import { addDays, localDay } from './localDay';

const paris = 'Europe/Paris';

describe('localDay', () => {
  it('names the calendar day of an afternoon answer', () => {
    expect(localDay(new Date('2026-11-06T14:00:00Z'), 4, paris)).toBe('2026-11-06');
  });

  it('counts a late-night session after midnight for the previous day', () => {
    // 00:00 and 03:59 in Paris (UTC+1 in November)
    expect(localDay(new Date('2026-11-06T23:00:00Z'), 4, paris)).toBe('2026-11-06');
    expect(localDay(new Date('2026-11-07T02:59:59Z'), 4, paris)).toBe('2026-11-06');
  });

  it('starts the new day exactly at the rollover hour', () => {
    expect(localDay(new Date('2026-11-07T03:00:00Z'), 4, paris)).toBe('2026-11-07');
  });

  it('starts the day at midnight when the rollover hour is zero', () => {
    expect(localDay(new Date('2026-11-06T23:00:00Z'), 0, paris)).toBe('2026-11-07');
  });

  it('uses the wall clock of the time zone when summer time begins', () => {
    // 29 March 2026: 02:00 CET jumps to 03:00 CEST
    expect(localDay(new Date('2026-03-29T01:59:00Z'), 4, paris)).toBe('2026-03-28'); // 03:59 CEST
    expect(localDay(new Date('2026-03-29T02:00:00Z'), 4, paris)).toBe('2026-03-29'); // 04:00 CEST
  });

  it('uses the wall clock of the time zone when summer time ends', () => {
    // 25 October 2026: 03:00 CEST falls back to 02:00 CET
    expect(localDay(new Date('2026-10-25T02:59:00Z'), 4, paris)).toBe('2026-10-24'); // 03:59 CET
    expect(localDay(new Date('2026-10-25T03:00:00Z'), 4, paris)).toBe('2026-10-25'); // 04:00 CET
  });

  it('steps back across month, year and leap-day boundaries', () => {
    expect(localDay(new Date('2027-01-01T08:00:00Z'), 4, 'America/New_York')).toBe('2026-12-31');
    expect(localDay(new Date('2028-03-01T01:00:00Z'), 4, 'UTC')).toBe('2028-02-29');
  });

  it('rolls over at 4 a.m. by default', () => {
    expect(localDay(new Date('2026-11-07T02:00:00Z'), undefined, paris)).toBe('2026-11-06');
  });

  it('refuses an invalid date, rollover hour or time zone', () => {
    expect(() => localDay(new Date('not a date'), 4, paris)).toThrow(RangeError);
    expect(() => localDay(new Date('2026-11-06T14:00:00Z'), 24, paris)).toThrow(RangeError);
    expect(() => localDay(new Date('2026-11-06T14:00:00Z'), 1.5, paris)).toThrow(RangeError);
    expect(() => localDay(new Date('2026-11-06T14:00:00Z'), 4, 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('moves a local day forward across month, year and leap-day boundaries', () => {
    expect(addDays('2026-11-06', 1)).toBe('2026-11-07');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-11-06', 0)).toBe('2026-11-06');
  });
});
