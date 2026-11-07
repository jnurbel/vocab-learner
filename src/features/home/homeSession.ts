import type { Card, Language } from '../../domain/card';
import { EXAM_CONFIG } from '../../domain/exam/examConfig';
import type { Label } from '../../domain/label';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import { countNewWordsIntroduced } from '../../domain/srs/newWordsToday';
import { studyDay } from '../../domain/srs/studyDay';
import { newPerDayOf } from '../../domain/studySettings';
import { RECENT_SESSIONS_MS, type FlashcardStore } from '../flashcards/flashcardSession';
import { buildHomeView, type HomeView } from './homeView';

export interface HomeSelection {
  cards: readonly Card[];
  labels: readonly Label[];
  language: Language;
}

export interface HomeDependencies {
  store: Pick<FlashcardStore, 'load'>;
  srs: SrsDependencies;
  clock: () => Date;
}

/** Reads the stored progress now, and builds the home of the language for the learner's day. */
export async function loadHomeView(
  selection: HomeSelection,
  { store, srs, clock }: HomeDependencies,
): Promise<HomeView> {
  const now = clock();
  const data = await store.load(new Date(now.getTime() - RECENT_SESSIONS_MS).toISOString());
  const today = studyDay(now, data.progress?.lastActiveDate, srs);
  return buildHomeView(
    {
      ...selection,
      states: data.reviewStates,
      today,
      newPerDay: newPerDayOf(data.settings),
      newIntroducedToday: countNewWordsIntroduced(data.recentSessions, today, srs),
      ...(data.settings === undefined ? {} : { settings: data.settings }),
      ...(data.progress === undefined ? {} : { progress: data.progress }),
    },
    { srs, exam: EXAM_CONFIG },
  );
}
