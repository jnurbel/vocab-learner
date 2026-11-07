import type { Card, Language } from '../card';
import type { Label } from '../label';
import { createInitialReviewState, type ReviewState } from '../srs/reviewState';

export const created = '2026-10-01T00:00:00.000Z';

export function card(
  id: string,
  labelIds: string[],
  options: { language?: Language; createdAt?: string } = {},
): Card {
  return {
    id,
    language: options.language ?? 'zh',
    term: id,
    translation: id,
    labelIds,
    source: 'manual',
    createdAt: options.createdAt ?? created,
    updatedAt: created,
  };
}

/** `count` words of one label, ids `${prefix}1`, `${prefix}2`…, added in that order. */
export function words(prefix: string, count: number, labelIds: string[] = [prefix]): Card[] {
  return Array.from({ length: count }, (_, index) =>
    card(`${prefix}${String(index + 1)}`, labelIds, {
      createdAt: new Date(Date.parse(created) + index * 1000).toISOString(),
    }),
  );
}

export function focusLabel(id: string, examDate?: string, extra: Partial<Label> = {}): Label {
  return {
    id,
    name: id,
    isFocus: true,
    ...(examDate === undefined ? {} : { examDate }),
    createdAt: created,
    updatedAt: created,
    ...extra,
  };
}

/** A word already reviewed, due at `due`. */
export function reviewed(
  cardId: string,
  due: string,
  extra: Partial<ReviewState> = {},
): ReviewState {
  return {
    ...createInitialReviewState(cardId, new Date(created)),
    reps: 2,
    stability: 4,
    difficulty: 5,
    state: 'review',
    successDays: 1,
    peakStage: 'sprout',
    due,
    lastRatedDay: '2026-10-20',
    lastReviewAt: '2026-10-20T10:00:00.000Z',
    ...extra,
  };
}
