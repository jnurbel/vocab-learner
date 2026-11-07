import type { EconomyConfig, XpTable } from './economyConfig';

/** Why experience points are given: one entry of the table of GAME_DESIGN.md 4.1. */
export type XpReason = keyof XpTable;

export interface XpAward {
  base: number;
  /** False for the real learning milestones, which the daily goal never reduces. */
  diminishing: boolean;
}

/** Milestones of real learning: never reduced after the daily goal (GAME_DESIGN.md 4.1). */
const MILESTONES: ReadonlySet<XpReason> = new Set([
  'stageReached',
  'pathStepValidated',
  'finalChallengePassed',
]);

export function xpFor(reason: XpReason, config: Pick<EconomyConfig, 'xp'>): XpAward {
  return { base: config.xp[reason], diminishing: !MILESTONES.has(reason) };
}
