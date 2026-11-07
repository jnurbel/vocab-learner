import { describe, expect, it } from 'vitest';
import { ECONOMY_CONFIG } from './economyConfig';
import { xpFor, type XpReason } from './xp';

describe('the experience points of an action (GAME_DESIGN.md 4.1)', () => {
  it.each<[XpReason, number, boolean]>([
    ['correct', 10, true],
    ['correctWithHint', 5, true],
    ['almost', 5, true],
    ['wrong', 2, true],
    ['cardIntroduced', 5, true],
    ['sessionCompleted', 30, true],
    ['messengerCompleted', 10, true],
    ['stageReached', 15, false],
    ['pathStepValidated', 50, false],
    ['finalChallengePassed', 100, false],
  ])('gives %s %i XP, diminishing after the daily goal: %s', (reason, base, diminishing) => {
    expect(xpFor(reason, ECONOMY_CONFIG)).toEqual({ base, diminishing });
  });

  it('rewards "I do not know" as much as a wrong guess, so that honesty costs nothing', () => {
    expect(xpFor('wrong', ECONOMY_CONFIG).base).toBeGreaterThan(0);
  });
});
