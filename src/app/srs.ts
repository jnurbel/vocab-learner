import { GAME_CONFIG } from '../domain/srs/config';
import type { SrsDependencies } from '../domain/srs/dependencies';
import { createFsrsMemoryModel } from '../domain/srs/fsrsMemoryModel';

/** The app's spaced repetition, created once; days follow the device's time zone. */
export const srs: SrsDependencies = {
  model: createFsrsMemoryModel(GAME_CONFIG.fsrs),
  config: GAME_CONFIG,
};
