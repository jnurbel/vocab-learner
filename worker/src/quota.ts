/**
 * Daily quota of photos per access code, kept in Workers KV under `<code hash>:<UTC day>`.
 *
 * KV is eventually consistent: two photos read at the same moment, or from two Cloudflare
 * locations, may both see the same counter. The quota is therefore approximate, which is
 * acceptable here: the hard cap on cost is the spend limit set in the Anthropic console.
 */

/** The subset of the Workers KV namespace that the quota uses. */
export interface QuotaStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

export const DEFAULT_DAILY_LIMIT = 30;
/** A counter outlives its day a little, so that clock skew never resets it early. */
export const QUOTA_TTL_SECONDS = 2 * 24 * 60 * 60;

const COUNT = /^\d{1,9}$/;

/** DAILY_LIMIT when it is a positive whole number, else the default. */
export function dailyLimit(value: string | undefined): number {
  const limit = COUNT.test(value ?? '') ? Number(value) : 0;
  return limit > 0 ? limit : DEFAULT_DAILY_LIMIT;
}

export function quotaKey(codeHash: string, now: Date): string {
  return `${codeHash}:${now.toISOString().slice(0, 10)}`;
}

/** Seconds until the quota resets at 00:00 UTC, rounded up. */
export function secondsUntilUtcMidnight(now: Date): number {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((midnight - now.getTime()) / 1000);
}

/** Photos already read today with this code; an unreadable counter counts as a full quota. */
export async function photosUsed(store: QuotaStore, key: string): Promise<number> {
  const stored = await store.get(key);
  if (stored === null) {
    return 0;
  }
  return COUNT.test(stored) ? Number(stored) : Number.POSITIVE_INFINITY;
}
