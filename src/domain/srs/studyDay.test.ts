import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import { studyDay } from './studyDay';

const srs = { config: GAME_CONFIG, timeZone: 'Europe/Paris' };

describe('studyDay', () => {
  it('is the local day of the session when the learner was last active earlier', () => {
    expect(studyDay(new Date('2026-11-06T14:00:00Z'), '2026-11-05', srs)).toBe('2026-11-06');
  });

  it('counts a session after midnight for the previous evening', () => {
    expect(studyDay(new Date('2026-11-07T01:00:00Z'), undefined, srs)).toBe('2026-11-06');
  });

  it('never goes back before the last active day when the clock went back', () => {
    expect(studyDay(new Date('2026-11-06T14:00:00Z'), '2026-11-08', srs)).toBe('2026-11-08');
  });
});
