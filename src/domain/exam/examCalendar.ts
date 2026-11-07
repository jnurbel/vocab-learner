import type { Card } from '../card';
import type { Label } from '../label';
import type { LocalDay } from '../srs/localDay';

const MS_PER_DAY = 86_400_000;

/** Whole days from `today` to `day` (GAME_DESIGN.md 2.1): 0 on the day, negative after it. */
export function daysUntil(day: LocalDay, today: LocalDay): number {
  return Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / MS_PER_DAY,
  );
}

/** The test date of a pinned label still to come (today included), if any. */
export function upcomingExamOf(label: Label, today: LocalDay): LocalDay | undefined {
  return label.isFocus && label.examDate !== undefined && label.examDate >= today
    ? label.examDate
    : undefined;
}

/**
 * E(card): the nearest test to come among the pinned labels of the word (GAME_DESIGN.md 2.1);
 * a word may belong to two labels with a test.
 */
export function nearestUpcomingExam(
  card: Card,
  labels: readonly Label[],
  today: LocalDay,
): LocalDay | undefined {
  let nearest: LocalDay | undefined;
  for (const label of labels) {
    const exam = card.labelIds.includes(label.id) ? upcomingExamOf(label, today) : undefined;
    if (exam !== undefined && (nearest === undefined || exam < nearest)) {
      nearest = exam;
    }
  }
  return nearest;
}
