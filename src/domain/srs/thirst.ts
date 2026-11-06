import type { Moment, SrsDependencies } from './dependencies';
import { localDay, type LocalDay } from './localDay';
import type { ReviewState } from './reviewState';

/** 0: not thirsty; 1: due today; 2: due and likely forgotten (GAME_DESIGN.md 3.3). */
export type Thirst = 0 | 1 | 2;

/** True when a reviewed word falls due on `today` or earlier, in the learner's local days. */
export function isDueBy(
  state: ReviewState,
  today: LocalDay,
  { config, timeZone }: Pick<SrsDependencies, 'config' | 'timeZone'>,
): boolean {
  return state.reps > 0 && localDay(new Date(state.due), config.dayStartHour, timeZone) <= today;
}

export function thirstOf(state: ReviewState, moment: Moment, srs: SrsDependencies): Thirst {
  if (!isDueBy(state, moment.today, srs)) {
    return 0;
  }
  const recall = srs.model.retrievability(state, moment.now);
  return recall < srs.config.strongThirstRetrievability ? 2 : 1;
}
