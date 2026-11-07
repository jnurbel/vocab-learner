import { describe, expect, it } from 'vitest';
import { EXAM_CONFIG } from './exam/examConfig';
import type { Label } from './label';
import {
  recentlyUnfocused,
  setExamDate,
  setLabelFocus,
  undoAutoUnfocus,
  unfocusPastExams,
} from './labelFocus';

const created = '2026-11-01T00:00:00.000Z';
const now = '2026-11-07T10:00:00.000Z';
const today = '2026-11-07';

function label(id: string, extra: Partial<Label> = {}): Label {
  return { id, name: id, isFocus: false, createdAt: created, updatedAt: created, ...extra };
}

describe('setLabelFocus', () => {
  it('pins a label so that the home screen and the sessions put it first', () => {
    const result = setLabelFocus([label('lesson'), label('animals')], 'lesson', true, now);

    expect(result).toEqual({
      ok: true,
      value: [label('lesson', { isFocus: true, updatedAt: now }), label('animals')],
    });
  });

  it('unpins a label and keeps its test date, should it be pinned again', () => {
    const pinned = label('lesson', { isFocus: true, examDate: '2026-11-13' });

    const result = setLabelFocus([pinned], 'lesson', false, now);

    expect(result).toEqual({
      ok: true,
      value: [{ ...pinned, isFocus: false, updatedAt: now }],
    });
  });

  it('refuses a label that no longer exists', () => {
    expect(setLabelFocus([label('lesson')], 'gone', true, now)).toEqual({
      ok: false,
      errors: ['labelNotFound'],
    });
  });
});

describe('setExamDate', () => {
  const set = (rawDate: string, labels = [label('lesson')]) =>
    setExamDate(labels, 'lesson', rawDate, { today, now }, EXAM_CONFIG);

  it('sets a test date in the future and pins the label, since a test is worth working on', () => {
    expect(set('2026-11-13')).toEqual({
      ok: true,
      value: [label('lesson', { isFocus: true, examDate: '2026-11-13', updatedAt: now })],
    });
  });

  it('accepts a test today', () => {
    expect(set(today).ok).toBe(true);
  });

  it('refuses a test date in the past', () => {
    expect(set('2026-11-06')).toEqual({ ok: false, errors: ['pastDate'] });
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '13/11/2026',
    '2026-11-13T00:00:00Z',
    '<script>',
    ' 2026-11-13',
  ])('refuses %j, which is not a calendar day', (rawDate) => {
    expect(set(rawDate)).toEqual({ ok: false, errors: ['invalidDate'] });
  });

  it('refuses a test more than a year ahead, which no lesson plans', () => {
    expect(set('2027-11-07').ok).toBe(true);
    expect(set('2027-11-08')).toEqual({ ok: false, errors: ['tooFar'] });
    expect(set('9999-12-31')).toEqual({ ok: false, errors: ['tooFar'] });
  });

  it('removes the test date when the field is emptied; the label stays pinned', () => {
    const pinned = label('lesson', { isFocus: true, examDate: '2026-11-13' });

    expect(set('', [pinned])).toEqual({
      ok: true,
      value: [label('lesson', { isFocus: true, updatedAt: now })],
    });
  });

  it('refuses a label that no longer exists', () => {
    expect(setExamDate([], 'lesson', '2026-11-13', { today, now }, EXAM_CONFIG)).toEqual({
      ok: false,
      errors: ['labelNotFound'],
    });
  });
});

describe('unfocusPastExams', () => {
  const pinned = (examDate?: string) =>
    label('lesson', { isFocus: true, ...(examDate === undefined ? {} : { examDate }) });

  it('unpins a label the day after its test, keeping the date to undo it', () => {
    const changed = unfocusPastExams([pinned('2026-11-06')], { today, now }, EXAM_CONFIG);

    expect(changed).toEqual([
      label('lesson', {
        isFocus: false,
        pastExamDate: '2026-11-06',
        unfocusedOn: today,
        updatedAt: now,
      }),
    ]);
  });

  it('also unpins a label whose test is long past, when the app was not opened since', () => {
    expect(unfocusPastExams([pinned('2026-10-01')], { today, now }, EXAM_CONFIG)).toHaveLength(1);
  });

  it('leaves a label alone on the day of its test, and before', () => {
    expect(
      unfocusPastExams([pinned(today), pinned('2026-11-13')], { today, now }, EXAM_CONFIG),
    ).toEqual([]);
  });

  it('leaves alone the labels without a test, and those not pinned', () => {
    const unpinned = label('old', { examDate: '2026-10-01' });

    expect(unfocusPastExams([pinned(), unpinned], { today, now }, EXAM_CONFIG)).toEqual([]);
  });
});

describe('undoAutoUnfocus', () => {
  const unfocused = label('lesson', {
    pastExamDate: '2026-11-06',
    unfocusedOn: today,
  });

  it('pins the label again, without a test date: the test is over', () => {
    expect(undoAutoUnfocus([unfocused], 'lesson', now)).toEqual({
      ok: true,
      value: [label('lesson', { isFocus: true, pastExamDate: '2026-11-06', updatedAt: now })],
    });
  });

  it('refuses a label that was not unpinned automatically', () => {
    expect(undoAutoUnfocus([label('lesson')], 'lesson', now)).toEqual({
      ok: false,
      errors: ['nothingToUndo'],
    });
  });

  it('refuses a label that no longer exists', () => {
    expect(undoAutoUnfocus([], 'lesson', now)).toEqual({ ok: false, errors: ['labelNotFound'] });
  });
});

describe('recentlyUnfocused', () => {
  it('lists the labels unpinned automatically today: the undo is offered all day long', () => {
    const todays = label('today', { pastExamDate: '2026-11-06', unfocusedOn: today });
    const yesterdays = label('yesterday', {
      pastExamDate: '2026-11-05',
      unfocusedOn: '2026-11-06',
    });

    expect(recentlyUnfocused([todays, yesterdays, label('other')], today)).toEqual([todays]);
  });
});
