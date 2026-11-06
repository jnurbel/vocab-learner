import type { SrsConfig } from './config';
import type { ReviewState, Stage } from './reviewState';

/** Every stage, from the lowest to the highest. */
export const STAGES: readonly Stage[] = Object.freeze([
  'seed',
  'sprout',
  'stem',
  'bud',
  'flower',
  'lantern',
]);

/** True when `stage` is `floor` or a higher stage. */
export function isAtLeast(stage: Stage, floor: Stage): boolean {
  return STAGES.indexOf(stage) >= STAGES.indexOf(floor);
}

export function higherStage(a: Stage, b: Stage): Stage {
  return isAtLeast(a, b) ? a : b;
}

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
