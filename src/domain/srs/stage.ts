import type { SrsConfig } from './config';
import type { ReviewState, Stage } from './reviewState';

/** Current stage of the plant (GAME_DESIGN.md 3.1): honest, it goes down after a lapse. */
export function stageOf(state: ReviewState, config: Pick<SrsConfig, 'stageThresholds'>): Stage {
  if (state.reps === 0) {
    return 'seed';
  }
  const reached = config.stageThresholds.find(
    (threshold) =>
      state.stability >= threshold.minStabilityDays &&
      state.successDays >= threshold.minSuccessDays,
  );
  return reached?.stage ?? 'sprout';
}
