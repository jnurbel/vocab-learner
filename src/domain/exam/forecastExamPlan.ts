import type { Card } from '../card';
import type { Label } from '../label';
import { applyAnswer } from '../srs/applyAnswer';
import type { SrsDependencies } from '../srs/dependencies';
import { addDays, isOnOrAfter, type LocalDay } from '../srs/localDay';
import { masteryOf } from '../srs/mastery';
import { createInitialReviewState, type Rating, type ReviewState } from '../srs/reviewState';
import { capDueForExam } from './capDueForExam';
import { dailyNewQuota } from './dailyNewQuota';
import type { ExamConfig } from './examConfig';
import { daysUntil } from './examCalendar';

export type ExamPlanStatus =
  'onTrack' | 'tight' | 'overloaded' | 'shortNotice' | 'examDay' | 'past';

export interface ExamForecastInput {
  examDate: LocalDay;
  /** The words of the label in one language. */
  cards: readonly Card[];
  states: readonly ReviewState[];
  today: LocalDay;
  newPerDay: number;
  /** New words of the label already introduced today. */
  newIntroducedToday?: number;
  /** The learner chose the intensive mode for this test (GAME_DESIGN.md 2.5). */
  intensive?: boolean;
}

export interface ForecastDay {
  day: LocalDay;
  newCount: number;
  reviewCount: number;
  estMinutes: number;
}

export interface ExamForecast {
  status: ExamPlanStatus;
  daysLeft: number;
  total: number;
  masteredNow: number;
  /** Words not mastered yet. */
  wordsLeft: number;
  days: ForecastDay[];
  /** New words introduced before the test, and those that will not be. */
  coveredNew: number;
  uncoveredNew: number;
  /** Words at the mastery stage or above on the test day. */
  expectedMasteredAtExam: number;
  maxMinutesPerDay: number;
  /** The first day at the end of which every word should be mastered, before the test. */
  fullyMasteredOn?: LocalDay;
}

export interface ForecastDependencies {
  srs: SrsDependencies;
  exam: ExamConfig;
}

/** The synthetic label the forecast plans: the words given, pinned, with the test date. */
const FORECAST_LABEL_ID = 'forecast';

/**
 * Simulates the days left before a test with the app's own policy (GAME_DESIGN.md 2.4): each
 * day the due words (capped for the test) and the quota of new words are answered, every
 * `forecastFailEvery`-th answer wrong, and the memory model is updated. Pure and deterministic,
 * so that the home screen can tell honestly whether the plan holds.
 */
export function forecastExamPlan(
  input: ExamForecastInput,
  { srs, exam }: ForecastDependencies,
): ExamForecast {
  const { today, examDate } = input;
  const daysLeft = daysUntil(examDate, today);
  const cards = input.cards.map((card) => ({ ...card, labelIds: [FORECAST_LABEL_ID] }));
  const label: Label = {
    id: FORECAST_LABEL_ID,
    name: FORECAST_LABEL_ID,
    isFocus: true,
    examDate,
    createdAt: today,
    updatedAt: today,
  };
  const states = new Map<string, ReviewState>();
  for (const state of input.states) {
    states.set(state.cardId, state);
  }
  const reviewedStates = () => cards.flatMap(({ id }) => states.get(id) ?? []);
  const masteredCount = () =>
    masteryOf(
      cards.map(({ id }) => states.get(id) ?? createInitialReviewState(id, new Date(0))),
      srs.config,
    ).mastered;
  const isNew = (card: Card) => (states.get(card.id)?.reps ?? 0) === 0;
  const masteredNow = masteredCount();
  const initialNew = cards.filter(isNew).length;

  const days: ForecastDay[] = [];
  let coveredNew = 0;
  let answers = 0;
  let fullyMasteredOn: LocalDay | undefined;
  const lastDay = addDays(today, Math.min(daysLeft, exam.maxExamDaysAhead + 1) - 1);
  for (let day = today; day <= lastDay; day = addDays(day, 1)) {
    const moment = { now: new Date(`${day}T12:00:00Z`), today: day };
    const alreadyIntroduced = day === today ? (input.newIntroducedToday ?? 0) : 0;
    const quota = dailyNewQuota(
      {
        cards,
        states: reviewedStates(),
        labels: [label],
        today: day,
        newPerDay: input.newPerDay,
        intensiveLabelIds: input.intensive === true ? [FORECAST_LABEL_ID] : [],
      },
      exam,
    );
    const reviews = cards.filter((card) => {
      const state = states.get(card.id);
      return (
        state !== undefined &&
        state.reps > 0 &&
        !isOnOrAfter(state.lastRatedDay, day) &&
        capDueForExam(state, examDate, day, srs, exam) <= day
      );
    });
    const introduced = cards.filter(isNew).slice(0, Math.max(0, quota - alreadyIntroduced));
    const answer = (card: Card) => {
      answers += 1;
      const rating: Rating = answers % exam.forecastFailEvery === 0 ? 'again' : 'good';
      const before = states.get(card.id) ?? createInitialReviewState(card.id, moment.now);
      states.set(card.id, applyAnswer(before, rating, moment, srs).state);
    };
    reviews.forEach(answer);
    introduced.forEach(answer);
    coveredNew += introduced.length;
    const seconds =
      introduced.length * (exam.itemCostSec.discovery + exam.itemCostSec.listenMeaning) +
      reviews.length * exam.itemCostSec.audioFlashcard;
    days.push({
      day,
      newCount: introduced.length,
      reviewCount: reviews.length,
      estMinutes: Math.ceil(seconds / 60),
    });
    if (fullyMasteredOn === undefined && cards.length > 0 && masteredCount() === cards.length) {
      fullyMasteredOn = day;
    }
  }

  const uncoveredNew = initialNew - coveredNew;
  const maxMinutesPerDay = Math.max(0, ...days.map(({ estMinutes }) => estMinutes));
  return {
    status: statusOf(daysLeft, uncoveredNew, maxMinutesPerDay, exam),
    daysLeft,
    total: cards.length,
    masteredNow,
    wordsLeft: cards.length - masteredNow,
    days,
    coveredNew,
    uncoveredNew,
    expectedMasteredAtExam: masteredCount(),
    maxMinutesPerDay,
    ...(fullyMasteredOn === undefined ? {} : { fullyMasteredOn }),
  };
}

function statusOf(
  daysLeft: number,
  uncoveredNew: number,
  maxMinutesPerDay: number,
  exam: Pick<ExamConfig, 'examTightMinutes' | 'examOverloadMinutes'>,
): ExamPlanStatus {
  if (daysLeft < 0) {
    return 'past';
  }
  if (daysLeft === 0) {
    return 'examDay';
  }
  if (uncoveredNew > 0 || maxMinutesPerDay > exam.examOverloadMinutes) {
    return 'overloaded';
  }
  if (daysLeft === 1) {
    return 'shortNotice';
  }
  return maxMinutesPerDay > exam.examTightMinutes ? 'tight' : 'onTrack';
}
