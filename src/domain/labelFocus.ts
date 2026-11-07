import type { ExamConfig } from './exam/examConfig';
import type { Label } from './label';
import { failure, success, type Result } from './result';
import { addDays, type LocalDay } from './srs/localDay';

export type LabelFocusError = 'labelNotFound';
export type ExamDateError = LabelFocusError | 'invalidDate' | 'pastDate' | 'tooFar';

/** The learner's day, and the instant written as `updatedAt`. */
export interface FocusClock {
  today: LocalDay;
  now: string;
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar day written 'YYYY-MM-DD' (no 30 February). */
function isCalendarDay(text: string): boolean {
  if (!CALENDAR_DAY.test(text)) {
    return false;
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function update(
  labels: readonly Label[],
  labelId: string,
  change: (label: Label) => Label,
): Result<Label[], LabelFocusError> {
  if (!labels.some(({ id }) => id === labelId)) {
    return failure(['labelNotFound']);
  }
  return success(
    labels.map((candidate) => (candidate.id === labelId ? change(candidate) : candidate)),
  );
}

function withoutExamDate(label: Label): Label {
  const copy = { ...label };
  delete copy.examDate;
  return copy;
}

/** Pins (or unpins) a label "à travailler" (DESIGN.md section 5); its test date is kept. */
export function setLabelFocus(
  labels: readonly Label[],
  labelId: string,
  isFocus: boolean,
  now: string,
): Result<Label[], LabelFocusError> {
  return update(labels, labelId, (label) => ({ ...label, isFocus, updatedAt: now }));
}

/**
 * Sets the test date typed by the learner (untrusted): a calendar day, today at the earliest
 * and at most `maxExamDaysAhead` days ahead. A test makes the label worth working on: it is
 * pinned. An empty field removes the date.
 */
export function setExamDate(
  labels: readonly Label[],
  labelId: string,
  rawDate: string,
  { today, now }: FocusClock,
  config: Pick<ExamConfig, 'maxExamDaysAhead'>,
): Result<Label[], ExamDateError> {
  if (rawDate === '') {
    return update(labels, labelId, (label) => ({ ...withoutExamDate(label), updatedAt: now }));
  }
  if (!isCalendarDay(rawDate)) {
    return failure(['invalidDate']);
  }
  if (rawDate < today) {
    return failure(['pastDate']);
  }
  if (rawDate > addDays(today, config.maxExamDaysAhead)) {
    return failure(['tooFar']);
  }
  return update(labels, labelId, (label) => ({
    ...label,
    isFocus: true,
    examDate: rawDate,
    updatedAt: now,
  }));
}

/**
 * Called at start-up (GAME_DESIGN.md 2.6): unpins the labels whose test is at least
 * `autoUnfocusDelayDays` days past. Returns only the labels changed, to be stored.
 */
export function unfocusPastExams(
  labels: readonly Label[],
  { today, now }: FocusClock,
  config: Pick<ExamConfig, 'autoUnfocusDelayDays'>,
): Label[] {
  return labels.flatMap((label) => {
    const { examDate } = label;
    if (!label.isFocus || examDate === undefined) {
      return [];
    }
    if (addDays(examDate, config.autoUnfocusDelayDays) > today) {
      return [];
    }
    return [
      {
        ...withoutExamDate(label),
        isFocus: false,
        pastExamDate: examDate,
        unfocusedOn: today,
        updatedAt: now,
      },
    ];
  });
}

/**
 * "Annuler le désépinglage": the label is pinned again. Its test is over, so it comes back
 * without a test date (no more interval capping); the past date stays for the record.
 */
export function undoAutoUnfocus(
  labels: readonly Label[],
  labelId: string,
  now: string,
): Result<Label[], LabelFocusError | 'nothingToUndo'> {
  const label = labels.find(({ id }) => id === labelId);
  if (label === undefined) {
    return failure(['labelNotFound']);
  }
  if (label.unfocusedOn === undefined) {
    return failure(['nothingToUndo']);
  }
  return update(labels, labelId, (current) => {
    const pinned: Label = { ...current, isFocus: true, updatedAt: now };
    delete pinned.unfocusedOn;
    return pinned;
  });
}

/** The labels unpinned automatically today: their banner and undo stay all day. */
export function recentlyUnfocused(labels: readonly Label[], today: LocalDay): Label[] {
  return labels.filter((label) => label.unfocusedOn === today);
}
