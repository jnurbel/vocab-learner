import { describe, expect, it } from 'vitest';
import type { SessionRecord, SessionResultRecord } from '../progressRecords';
import { GAME_CONFIG } from './config';
import { countNewWordsIntroduced } from './newWordsToday';

const srs = { config: GAME_CONFIG, timeZone: 'Europe/Paris' };
const today = '2026-11-06';

function session(id: string, results: SessionResultRecord[]): SessionRecord {
  return { id, language: 'zh', startedAt: '2026-11-06T08:00:00.000Z', results };
}

const discovered = (cardId: string, at: string): SessionResultRecord => ({
  cardId,
  outcome: 'correct',
  exercise: 'discovery',
  rating: 'good',
  at,
});

describe('countNewWordsIntroduced', () => {
  it('counts the new words discovered today across the sessions of the day', () => {
    const sessions = [
      session('morning', [discovered('a', '2026-11-06T08:01:00.000Z')]),
      session('evening', [discovered('b', '2026-11-06T19:00:00.000Z')]),
    ];

    expect(countNewWordsIntroduced(sessions, today, srs)).toBe(2);
  });

  it('counts a word once even when it was answered several times', () => {
    const sessions = [
      session('s', [
        discovered('a', '2026-11-06T08:01:00.000Z'),
        discovered('a', '2026-11-06T08:05:00.000Z'),
      ]),
    ];

    expect(countNewWordsIntroduced(sessions, today, srs)).toBe(1);
  });

  it('ignores the words discovered on another day, after midnight counting for the evening', () => {
    const sessions = [
      session('s', [
        discovered('yesterday', '2026-11-05T12:00:00.000Z'),
        discovered('late-yesterday', '2026-11-06T02:30:00.000Z'), // 03:30 in Paris
        discovered('late-today', '2026-11-07T01:00:00.000Z'), // 02:00 in Paris
      ]),
    ];

    expect(countNewWordsIntroduced(sessions, today, srs)).toBe(1);
  });

  it('ignores reviews of known words and results without a date', () => {
    const sessions = [
      session('s', [
        { ...discovered('review', '2026-11-06T08:01:00.000Z'), exercise: 'audioFlashcard' },
        { cardId: 'undated', outcome: 'correct', exercise: 'discovery' },
      ]),
    ];

    expect(countNewWordsIntroduced(sessions, today, srs)).toBe(0);
  });

  it('ignores the free practice sessions, which never introduce a word', () => {
    const practice = {
      ...session('practice', [discovered('a', '2026-11-06T08:01:00.000Z')]),
      mode: 'practice',
    };

    expect(countNewWordsIntroduced([practice], today, srs)).toBe(0);
  });
});
