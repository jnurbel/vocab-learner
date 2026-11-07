import type { Card } from '../card';
import type { Label } from '../label';
import type { LocalDay } from '../srs/localDay';
import type { ReviewState } from '../srs/reviewState';
import type { ExamConfig } from './examConfig';
import { daysUntil, upcomingExamOf } from './examCalendar';

export interface NewQuotaInput {
  /** The words of one language. */
  cards: readonly Card[];
  states: readonly ReviewState[];
  labels: readonly Label[];
  today: LocalDay;
  /** The learner's setting: the quota without a test, and its floor with one. */
  newPerDay: number;
  /** Labels whose test the learner chose to prepare in intensive mode (GAME_DESIGN.md 2.5). */
  intensiveLabelIds?: readonly string[];
}

type QuotaConfig = Pick<
  ExamConfig,
  'maxNewPerDay' | 'intensiveMaxNewPerDay' | 'examReserveDays' | 'examReserveMinDaysLeft'
>;

/** Days left to introduce new words, keeping a review-only reserve day when possible. */
export function introductionDays(daysLeft: number, config: QuotaConfig): number {
  const reserve = daysLeft >= config.examReserveMinDaysLeft ? config.examReserveDays : 0;
  return Math.max(1, daysLeft - reserve);
}

/** Words never reviewed yet. */
export function newCardsOf(cards: readonly Card[], states: readonly ReviewState[]): Card[] {
  const reviewedIds = new Set(states.filter(({ reps }) => reps > 0).map(({ cardId }) => cardId));
  return cards.filter(({ id }) => !reviewedIds.has(id));
}

/**
 * Today's quota of new words, every label together (GAME_DESIGN.md 2.2): each test to come
 * (tomorrow at the earliest) asks ceil(new words / introduction days); a word shared by two
 * labels counts once, for the nearest test. The total is capped at maxNewPerDay (or the
 * intensive cap), and never below the learner's setting.
 */
export function dailyNewQuota(input: NewQuotaInput, config: QuotaConfig): number {
  const newCards = newCardsOf(input.cards, input.states);
  const base = newCards.length > 0 ? input.newPerDay : 0;
  const tests = input.labels.flatMap((label) => {
    const exam = upcomingExamOf(label, input.today);
    return exam !== undefined && exam > input.today ? [{ labelId: label.id, exam }] : [];
  });
  if (tests.length === 0) {
    return base;
  }
  const newCountByExam = new Map<(typeof tests)[number], number>();
  for (const card of newCards) {
    const nearest = tests
      .filter(({ labelId }) => card.labelIds.includes(labelId))
      .reduce<(typeof tests)[number] | undefined>(
        (best, test) => (best === undefined || test.exam < best.exam ? test : best),
        undefined,
      );
    if (nearest !== undefined) {
      newCountByExam.set(nearest, (newCountByExam.get(nearest) ?? 0) + 1);
    }
  }
  let examQuota = 0;
  for (const [{ exam }, count] of newCountByExam) {
    examQuota += Math.ceil(count / introductionDays(daysUntil(exam, input.today), config));
  }
  const intensive = tests.some(
    ({ labelId }) => input.intensiveLabelIds?.includes(labelId) === true,
  );
  const cap = intensive ? config.intensiveMaxNewPerDay : config.maxNewPerDay;
  return Math.max(base, Math.min(cap, examQuota));
}
