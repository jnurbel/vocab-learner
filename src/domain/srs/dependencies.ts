import type { SrsConfig } from './config';
import type { LocalDay } from './localDay';
import type { MemoryModel } from './memoryModel';

/** An instant, and the learner's day it belongs to. */
export interface Moment {
  now: Date;
  /** Usually localDay(now), never earlier than the last active day (GAME_DESIGN.md 0.3). */
  today: LocalDay;
}

/** What the spaced repetition functions need: the memory model and the game constants. */
export interface SrsDependencies {
  model: MemoryModel;
  config: SrsConfig;
  /** IANA time zone of the learner's days; the device's when absent. */
  timeZone?: string;
}
