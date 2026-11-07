import type { LocalDay } from '../srs/localDay';
import type { EconomyConfig } from './economyConfig';
import type { XpAward } from './xp';

/** What was earned today: the points (shared by both languages) and the answers of each word. */
export interface DailyLedger {
  dailyXp: number;
  dailyXpDay: LocalDay | undefined;
  /** Answers rewarded today, per card id. */
  dailyRewardedCount: Readonly<Record<string, number>>;
}

export interface XpEarned {
  ledger: DailyLedger;
  gained: number;
  /** The base points, after the cap on a word answered many times today. */
  base: number;
  multiplier: number;
}

export interface EarnOptions {
  goal: number;
  /** The word answered, if any: its answers beyond the daily cap earn little. */
  cardId?: string;
}

/** The ledger of `today`: a new day starts from zero; an earlier day (clock back) changes nothing. */
export function ledgerOn(
  ledger: DailyLedger,
  today: LocalDay,
): DailyLedger & { dailyXpDay: LocalDay } {
  if (ledger.dailyXpDay !== undefined && ledger.dailyXpDay >= today) {
    return { ...ledger, dailyXpDay: ledger.dailyXpDay };
  }
  return { dailyXp: 0, dailyXpDay: today, dailyRewardedCount: {} };
}

/** Diminishing returns after the daily goal (GAME_DESIGN.md 4.2). */
export function xpMultiplier(
  dailyXpBefore: number,
  goal: number,
  config: Pick<EconomyConfig, 'diminishingTiers'>,
): number {
  const reached = config.diminishingTiers.filter(
    (tier) => dailyXpBefore >= tier.fromGoalMultiple * goal,
  );
  return reached.at(-1)?.factor ?? 1;
}

/** Adds an award to the day's ledger, which must already be the ledger of today. */
export function earnXp(
  ledger: DailyLedger,
  award: XpAward,
  { goal, cardId }: EarnOptions,
  config: EconomyConfig,
): XpEarned {
  const { base, counts } = cappedBase(ledger, award.base, cardId, config);
  const multiplier = award.diminishing ? xpMultiplier(ledger.dailyXp, goal, config) : 1;
  const gained = base > 0 ? Math.max(1, Math.floor(base * multiplier)) : 0;
  return {
    ledger: { ...ledger, dailyXp: ledger.dailyXp + gained, dailyRewardedCount: counts },
    gained,
    base,
    multiplier,
  };
}

function cappedBase(
  ledger: DailyLedger,
  base: number,
  cardId: string | undefined,
  config: EconomyConfig,
) {
  if (cardId === undefined) {
    return { base, counts: ledger.dailyRewardedCount };
  }
  const answered = ledger.dailyRewardedCount[cardId] ?? 0;
  return {
    base: answered < config.maxRewardedAnswersPerCardPerDay ? base : config.repeatedAnswerXp,
    counts: { ...ledger.dailyRewardedCount, [cardId]: answered + 1 },
  };
}
