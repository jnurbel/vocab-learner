import { describe, expect, it } from 'vitest';
import { earnXp, ledgerOn, xpMultiplier, type DailyLedger } from './dailyXp';
import { ECONOMY_CONFIG } from './economyConfig';

const goal = 300;
const today = '2026-11-07';
const fresh: DailyLedger = { dailyXp: 0, dailyXpDay: today, dailyRewardedCount: {} };
const answer = { base: 10, diminishing: true };

function ledgerWith(dailyXp: number): DailyLedger {
  return { ...fresh, dailyXp };
}

describe('the multiplier of the daily goal (GAME_DESIGN.md 4.2)', () => {
  it.each([
    [0, 1],
    [299, 1],
    [300, 0.5],
    [599, 0.5],
    [600, 0.25],
    [5000, 0.25],
  ])('after %i XP today, multiplies the next gains by %d', (before, factor) => {
    expect(xpMultiplier(before, goal, ECONOMY_CONFIG)).toBe(factor);
  });
});

describe('earning experience points during a day', () => {
  it('gives the full points below the daily goal and adds them to the day', () => {
    const earned = earnXp(fresh, answer, { goal }, ECONOMY_CONFIG);

    expect(earned).toMatchObject({ gained: 10, base: 10, multiplier: 1 });
    expect(earned.ledger.dailyXp).toBe(10);
  });

  it('halves the points once the daily goal is reached, and quarters them after twice the goal', () => {
    expect(earnXp(ledgerWith(300), answer, { goal }, ECONOMY_CONFIG).gained).toBe(5);
    expect(earnXp(ledgerWith(600), answer, { goal }, ECONOMY_CONFIG).gained).toBe(2);
  });

  it('never rounds a reduced gain down to nothing', () => {
    const wrong = { base: 2, diminishing: true };

    expect(earnXp(ledgerWith(600), wrong, { goal }, ECONOMY_CONFIG).gained).toBe(1);
  });

  it('gives nothing for an action worth nothing', () => {
    const nothing = { base: 0, diminishing: true };

    expect(earnXp(fresh, nothing, { goal }, ECONOMY_CONFIG).gained).toBe(0);
  });

  it('never reduces a learning milestone, even far beyond the goal', () => {
    const stage = { base: 15, diminishing: false };

    const earned = earnXp(ledgerWith(900), stage, { goal }, ECONOMY_CONFIG);

    expect(earned).toMatchObject({ gained: 15, multiplier: 1 });
  });

  it('gives a word its normal points for its first 3 answers of the day, then 1 point', () => {
    let ledger = fresh;
    const gains: number[] = [];
    for (let answers = 0; answers < 5; answers++) {
      const earned = earnXp(ledger, answer, { goal, cardId: 'c1' }, ECONOMY_CONFIG);
      gains.push(earned.gained);
      ledger = earned.ledger;
    }

    expect(gains).toEqual([10, 10, 10, 1, 1]);
    expect(ledger.dailyRewardedCount).toEqual({ c1: 5 });
  });

  it('counts the answers of each word separately', () => {
    const once = earnXp(fresh, answer, { goal, cardId: 'c1' }, ECONOMY_CONFIG).ledger;

    expect(
      earnXp(once, answer, { goal, cardId: 'c2' }, ECONOMY_CONFIG).ledger.dailyRewardedCount,
    ).toEqual({ c1: 1, c2: 1 });
  });

  it('caps a word repeated 20 times a day to 3 x 10 + 17 x 1 points before the multiplier (M13)', () => {
    let ledger = fresh;
    let total = 0;
    for (let answers = 0; answers < 20; answers++) {
      const earned = earnXp(ledger, answer, { goal: 10_000, cardId: 'c1' }, ECONOMY_CONFIG);
      total += earned.gained;
      ledger = earned.ledger;
    }

    expect(total).toBe(3 * 10 + 17 * 1);
  });
});

describe('the ledger of a day', () => {
  it('starts again from zero on a new local day', () => {
    const yesterday: DailyLedger = {
      dailyXp: 420,
      dailyXpDay: '2026-11-06',
      dailyRewardedCount: { c1: 3 },
    };

    expect(ledgerOn(yesterday, today)).toEqual(fresh);
  });

  it('starts from zero when nothing was ever earned', () => {
    expect(ledgerOn({ dailyXp: 0, dailyXpDay: undefined, dailyRewardedCount: {} }, today)).toEqual(
      fresh,
    );
  });

  it('keeps the same day as it is', () => {
    const sameDay = { ...fresh, dailyXp: 120, dailyRewardedCount: { c1: 2 } };

    expect(ledgerOn(sameDay, today)).toEqual(sameDay);
  });

  it('takes nothing away when the clock goes back to an earlier day', () => {
    const later = { ...fresh, dailyXp: 120, dailyXpDay: '2026-11-08' };

    expect(ledgerOn(later, today)).toEqual(later);
  });
});
