import type { SrsDependencies } from '../srs/dependencies';
import { addDays, localDay, type LocalDay } from '../srs/localDay';
import type { ReviewState } from '../srs/reviewState';
import type { ExamConfig } from './examConfig';

/**
 * The day a word falls due once capped for its test (GAME_DESIGN.md 2.3): every word is
 * reviewed at least once in the window [E - examWindowDays, E - 1]. A review the memory model
 * plans later is brought forward to the window start; a shorter interval is never lengthened.
 *
 * The cap is applied when the queue is read rather than stored with the state: the memory
 * model stays untouched, and a test date changed or removed applies at once (2.7).
 */
export function capDueForExam(
  state: ReviewState,
  examDay: LocalDay | undefined,
  today: LocalDay,
  { config, timeZone }: Pick<SrsDependencies, 'config' | 'timeZone'>,
  examConfig: Pick<ExamConfig, 'examWindowDays'>,
): LocalDay {
  const dueDay = localDay(new Date(state.due), config.dayStartHour, timeZone);
  if (examDay === undefined || today >= examDay) {
    return dueDay;
  }
  const windowStart = addDays(examDay, -examConfig.examWindowDays);
  const reviewedInWindow = state.lastRatedDay !== undefined && state.lastRatedDay >= windowStart;
  return reviewedInWindow || dueDay < windowStart ? dueDay : windowStart;
}
