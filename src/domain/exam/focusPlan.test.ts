import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../srs/config';
import { EXAM_CONFIG } from './examConfig';
import { focusLabel, words } from './exam.fixtures';
import { planFocus } from './focusPlan';

const srs = { config: GAME_CONFIG, timeZone: 'Europe/Paris' };

describe('planFocus', () => {
  const input = {
    languageCards: words('l', 500),
    states: [],
    today: '2026-11-06',
    newPerDay: 5,
    newIntroducedToday: 0,
  };
  const labels = [focusLabel('l', '2026-11-13')];

  it('allows 20 new words a day before a big test, 30 in intensive mode', () => {
    expect(planFocus(input, { labels, exam: EXAM_CONFIG }, srs).newQuotaLeft).toBe(20);
    expect(
      planFocus(input, { labels, exam: EXAM_CONFIG, intensiveLabelIds: ['l'] }, srs).newQuotaLeft,
    ).toBe(30);
  });

  it('never leaves a negative quota once more words were introduced than planned', () => {
    const plan = planFocus(
      { ...input, newIntroducedToday: 25 },
      { labels, exam: EXAM_CONFIG },
      srs,
    );

    expect(plan.newQuotaLeft).toBe(0);
  });
});
