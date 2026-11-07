import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../srs/config';
import { capDueForExam } from './capDueForExam';
import { EXAM_CONFIG } from './examConfig';
import { reviewed } from './exam.fixtures';

const srs = { config: GAME_CONFIG, timeZone: 'Europe/Paris' };
const exam = '2026-11-20';

function cap(
  state = reviewed('w', '2026-12-10T08:00:00Z'),
  today = '2026-11-06',
  examDay?: string,
) {
  return capDueForExam(state, examDay, today, srs, EXAM_CONFIG);
}

describe('capDueForExam', () => {
  it('keeps the memory model day when the word has no test to come', () => {
    expect(cap()).toBe('2026-12-10');
  });

  it('brings a review planned after the test forward to the start of the 2-day window', () => {
    expect(cap(undefined, '2026-11-06', exam)).toBe('2026-11-18');
  });

  it('never lengthens a short interval', () => {
    expect(cap(reviewed('w', '2026-11-09T08:00:00Z'), '2026-11-06', exam)).toBe('2026-11-09');
  });

  it('makes a word due inside the window when it was not reviewed in it yet', () => {
    expect(cap(undefined, '2026-11-19', exam)).toBe('2026-11-18');
  });

  it('leaves a word reviewed inside the window to the memory model', () => {
    const inWindow = reviewed('w', '2026-12-10T08:00:00Z', { lastRatedDay: '2026-11-18' });

    expect(cap(inWindow, '2026-11-19', exam)).toBe('2026-12-10');
  });

  it('stops capping on the day of the test', () => {
    expect(cap(undefined, exam, exam)).toBe('2026-12-10');
  });

  it('reads the due day in the learner time zone, with the 4 a.m. rollover', () => {
    // 02:30 in Paris still belongs to the previous day.
    expect(cap(reviewed('w', '2026-11-10T01:30:00Z'), '2026-11-06', exam)).toBe('2026-11-09');
  });
});
