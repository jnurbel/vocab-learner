import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../srs/config';
import { createFsrsMemoryModel } from '../srs/fsrsMemoryModel';
import { EXAM_CONFIG } from './examConfig';
import { reviewed, words } from './exam.fixtures';
import { forecastExamPlan, type ExamForecastInput } from './forecastExamPlan';

const srs = {
  model: createFsrsMemoryModel(GAME_CONFIG.fsrs),
  config: GAME_CONFIG,
  timeZone: 'Europe/Paris',
};
const today = '2026-11-06';

function forecast(overrides: Partial<ExamForecastInput>, exam = EXAM_CONFIG) {
  return forecastExamPlan(
    {
      examDate: '2026-11-13',
      cards: words('l', 25),
      states: [],
      today,
      newPerDay: 5,
      ...overrides,
    },
    { srs, exam },
  );
}

/** A word mastered long ago: stable for weeks, succeeded on many days. */
const mastered = (cardId: string) =>
  reviewed(cardId, '2026-12-20T08:00:00Z', { stability: 40, successDays: 5, peakStage: 'flower' });

describe('forecastExamPlan', () => {
  it('sees 25 words before a test in 7 days, 5 a day, and masters nearly all of them', () => {
    const result = forecast({});

    expect(result.status).toBe('onTrack');
    expect(result.daysLeft).toBe(7);
    expect(result.days).toHaveLength(7);
    expect(result.days[0]).toMatchObject({ day: today, newCount: 5, reviewCount: 0 });
    expect(result.days.at(-1)?.day).toBe('2026-11-12');
    expect(result.coveredNew).toBe(25);
    expect(result.uncoveredNew).toBe(0);
    expect(result.expectedMasteredAtExam).toBeGreaterThanOrEqual(20);
    expect(result.maxMinutesPerDay).toBeLessThanOrEqual(EXAM_CONFIG.examTightMinutes);
    expect(result).toMatchObject({ total: 25, masteredNow: 0, wordsLeft: 25 });
  });

  it('gives the same forecast for the same input', () => {
    expect(forecast({})).toEqual(forecast({}));
  });

  it('says honestly that 500 words in 7 days cannot all be seen at 20 a day', () => {
    const result = forecast({ cards: words('l', 500) });

    expect(result.status).toBe('overloaded');
    expect(result.days[0]?.newCount).toBe(20);
    expect(result.coveredNew).toBe(140);
    expect(result.uncoveredNew).toBe(360);
    expect(result.fullyMasteredOn).toBeUndefined();
  });

  it('sees more words in intensive mode', () => {
    expect(forecast({ cards: words('l', 500), intensive: true }).coveredNew).toBe(210);
  });

  it('aims at recognising every word when the test is tomorrow', () => {
    const result = forecast({ examDate: '2026-11-07', cards: words('l', 18) });

    expect(result.status).toBe('shortNotice');
    expect(result.coveredNew).toBe(18);
    expect(result.days).toHaveLength(1);
  });

  it('is overloaded with more than 20 new words for tomorrow', () => {
    const result = forecast({ examDate: '2026-11-07', cards: words('l', 30) });

    expect(result.status).toBe('overloaded');
    expect(result.uncoveredNew).toBe(10);
  });

  it('plans nothing on the day of the test', () => {
    const result = forecast({ examDate: today });

    expect(result).toMatchObject({ status: 'examDay', daysLeft: 0, days: [], coveredNew: 0 });
    expect(result.uncoveredNew).toBe(25);
  });

  it('plans nothing once the test is past', () => {
    expect(forecast({ examDate: '2026-11-05' })).toMatchObject({ status: 'past', daysLeft: -1 });
  });

  it('copes with a label without any word', () => {
    const result = forecast({ cards: [] });

    expect(result).toMatchObject({ status: 'onTrack', total: 0, coveredNew: 0, wordsLeft: 0 });
    expect(result.fullyMasteredOn).toBeUndefined();
  });

  it('follows a changed test date: further away, fewer new words a day', () => {
    const cards = words('l', 60);
    const soon = forecast({ examDate: '2026-11-08', cards, newPerDay: 1 });
    const later = forecast({ examDate: '2026-11-26', cards, newPerDay: 1 });

    expect(soon.status).toBe('overloaded');
    expect(later.days[0]?.newCount).toBe(4);
    expect(later.uncoveredNew).toBe(0);
    expect(later.status).not.toBe('overloaded');
  });

  it('is tight when the daily work goes beyond the tight threshold only', () => {
    const exam = { ...EXAM_CONFIG, examTightMinutes: 1, examOverloadMinutes: 100 };

    expect(forecast({}, exam).status).toBe('tight');
  });

  it('is overloaded when the daily work goes beyond the overload threshold', () => {
    const exam = { ...EXAM_CONFIG, examTightMinutes: 0, examOverloadMinutes: 1 };

    expect(forecast({}, exam).status).toBe('overloaded');
  });

  it('counts the words already mastered, and says when everything is', () => {
    const cards = words('l', 3);
    const result = forecast({ cards, states: cards.map(({ id }) => mastered(id)) });

    expect(result).toMatchObject({ masteredNow: 3, wordsLeft: 0, expectedMasteredAtExam: 3 });
    expect(result.fullyMasteredOn).toBe(today);
  });

  it('gives the day when every word should be mastered', () => {
    const result = forecast({ examDate: '2026-11-27', cards: words('l', 5) });

    expect(result.fullyMasteredOn).toBeDefined();
    expect(result.fullyMasteredOn! > today).toBe(true);
    expect(result.fullyMasteredOn! < '2026-11-27').toBe(true);
  });

  it('counts the new words already introduced today', () => {
    expect(forecast({ newIntroducedToday: 5 }).days[0]?.newCount).toBe(0);
  });

  it('reviews the words already started that fall due, not those rated today', () => {
    const cards = words('l', 2);
    const states = [
      reviewed('l1', '2026-11-05T08:00:00Z'),
      reviewed('l2', '2026-11-05T08:00:00Z', { lastRatedDay: today }),
    ];

    expect(forecast({ cards, states }).days[0]).toMatchObject({ newCount: 0, reviewCount: 1 });
  });

  it('simulates at most the longest test horizon, whatever the date', () => {
    const result = forecast({ examDate: '2099-01-01', cards: words('l', 3) });

    expect(result.days.length).toBeLessThanOrEqual(EXAM_CONFIG.maxExamDaysAhead + 1);
  });
});
