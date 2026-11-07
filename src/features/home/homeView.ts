import type { Card, Language } from '../../domain/card';
import { selectCards } from '../../domain/cardSelection';
import type { ExamConfig } from '../../domain/exam/examConfig';
import { forecastExamPlan, type ExamForecast } from '../../domain/exam/forecastExamPlan';
import type { Label } from '../../domain/label';
import { recentlyUnfocused } from '../../domain/labelFocus';
import { countWordsByLabel } from '../../domain/labelOperations';
import type { ProgressRecord, SettingsRecord } from '../../domain/progressRecords';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import type { LocalDay } from '../../domain/srs/localDay';
import { masteryOf, type Mastery } from '../../domain/srs/mastery';
import { createInitialReviewState, type ReviewState } from '../../domain/srs/reviewState';
import { summarizeStudyOutlook } from '../../domain/srs/studyOutlook';
import { focusPlanningOf } from '../flashcards/flashcardSession';

/** The daily goal when the learner chose none (GAME_DESIGN.md 4.2); the game owns the XP. */
const DEFAULT_DAILY_GOAL_XP = 300;
/** Words listed as resisting. */
const RESISTING_COUNT = 3;

export interface HomeViewInput {
  cards: readonly Card[];
  labels: readonly Label[];
  states: readonly ReviewState[];
  today: LocalDay;
  language: Language;
  newPerDay: number;
  newIntroducedToday: number;
  settings?: SettingsRecord;
  progress?: ProgressRecord;
}

export interface LabelView {
  label: Label;
  wordCount: number;
  mastery: Mastery;
  /** Words to water today. */
  dueCount: number;
}

export interface FocusLabelView extends LabelView {
  /** New words of the label today's quota allows. */
  newCount: number;
  /** With a test date only. */
  forecast?: ExamForecast;
}

export interface ProgressView {
  xp?: number;
  level?: number;
  streakDays?: number;
  bestStreak?: number;
  /** XP earned today: 0 when the last XP was earned on another day. */
  dailyXp: number;
  dailyGoalXp: number;
}

/** States of the home screen (GAME_DESIGN.md 8.1). */
export type HomeState = 'noCards' | 'nothingDue' | 'default';

export interface HomeView {
  state: HomeState;
  today: LocalDay;
  focus: FocusLabelView[];
  others: LabelView[];
  session: { reviewCount: number; newCount: number; minutes: number };
  resisting: { card: Card; lapses: number }[];
  unpinnedToday: Label[];
  /** Absent until the game keeps any progress: the zone stays neutral. */
  progress?: ProgressView;
  intensiveLabelIds: string[];
}

export interface HomeViewDependencies {
  srs: SrsDependencies;
  exam: ExamConfig;
}

/** Everything the home screen shows for one language, computed from the stored data. */
export function buildHomeView(input: HomeViewInput, deps: HomeViewDependencies): HomeView {
  const { srs, exam } = deps;
  const { today, language } = input;
  const languageCards = selectCards(input.cards, { labelIds: [], language });
  const focus = focusPlanningOf(input.labels, input.settings);
  const outlookOf = (labelIds: readonly string[]) =>
    summarizeStudyOutlook({ ...input, cards: languageCards, labelIds, focus }, srs);
  const stateByCardId = new Map(input.states.map((state) => [state.cardId, state] as const));
  const stateOf = (card: Card) =>
    stateByCardId.get(card.id) ?? createInitialReviewState(card.id, new Date(0));

  const shown = countWordsByLabel(input.labels, languageCards).filter(
    ({ wordCount }) => wordCount > 0,
  );
  const labelView = (label: Label, wordCount: number) => {
    const words = selectCards(languageCards, { labelIds: [label.id] });
    const outlook = outlookOf([label.id]);
    return {
      words,
      outlook,
      view: {
        label,
        wordCount,
        mastery: masteryOf(words.map(stateOf), srs.config),
        dueCount: outlook.dueToday,
      },
    };
  };

  const focusViews = shown
    .filter(({ label }) => label.isFocus)
    .map(({ label, wordCount }): FocusLabelView => {
      const { words, outlook, view } = labelView(label, wordCount);
      return {
        ...view,
        newCount: outlook.newAvailableToday,
        ...(label.examDate === undefined
          ? {}
          : {
              forecast: forecastExamPlan(
                {
                  examDate: label.examDate,
                  cards: words,
                  states: input.states,
                  today,
                  newPerDay: input.newPerDay,
                  intensive: focus.intensiveLabelIds?.includes(label.id) === true,
                },
                { srs, exam },
              ),
            }),
      };
    })
    .sort((a, b) =>
      (a.label.examDate ?? '9999-12-31').localeCompare(b.label.examDate ?? '9999-12-31'),
    );
  const others = shown
    .filter(({ label }) => !label.isFocus)
    .map(({ label, wordCount }) => labelView(label, wordCount).view);

  const outlook = outlookOf([]);
  const reviewCount = outlook.dueToday;
  const newCount = Math.min(outlook.newAvailableToday, exam.maxNewPerSession);
  const seconds =
    newCount * (exam.itemCostSec.discovery + exam.itemCostSec.listenMeaning) +
    reviewCount * exam.itemCostSec.audioFlashcard;
  const shownIds = new Set(shown.map(({ label }) => label.id));
  const progress = progressView(input.progress, input.settings, today);

  return {
    state: homeStateOf(languageCards.length, reviewCount + newCount),
    today,
    focus: focusViews,
    others,
    session: { reviewCount, newCount, minutes: Math.ceil(seconds / 60) },
    resisting: languageCards
      .map((card) => ({ card, lapses: stateOf(card).lapses }))
      .filter(({ lapses }) => lapses > 0)
      .sort((a, b) => b.lapses - a.lapses || a.card.term.localeCompare(b.card.term))
      .slice(0, RESISTING_COUNT),
    unpinnedToday: recentlyUnfocused(input.labels, today).filter(({ id }) => shownIds.has(id)),
    ...(progress === undefined ? {} : { progress }),
    intensiveLabelIds: [...(focus.intensiveLabelIds ?? [])],
  };
}

function homeStateOf(wordCount: number, sessionCount: number): HomeState {
  if (wordCount === 0) {
    return 'noCards';
  }
  return sessionCount === 0 ? 'nothingDue' : 'default';
}

/** Only reads what the game stored; the XP rules live elsewhere. */
function progressView(
  progress: ProgressRecord | undefined,
  settings: SettingsRecord | undefined,
  today: LocalDay,
): ProgressView | undefined {
  if (progress === undefined) {
    return undefined;
  }
  const { xp, level, streakDays, bestStreak, dailyXp, dailyXpDay } = progress;
  if ([xp, level, streakDays, dailyXp].every((value) => value === undefined)) {
    return undefined;
  }
  return {
    ...(xp === undefined ? {} : { xp }),
    ...(level === undefined ? {} : { level }),
    ...(streakDays === undefined ? {} : { streakDays }),
    ...(bestStreak === undefined ? {} : { bestStreak }),
    dailyXp: dailyXpDay === today ? (dailyXp ?? 0) : 0,
    dailyGoalXp: settings?.dailyGoalXp ?? DEFAULT_DAILY_GOAL_XP,
  };
}
