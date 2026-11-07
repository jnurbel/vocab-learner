import type { Card, Language } from '../../domain/card';
import { selectCards } from '../../domain/cardSelection';
import type { Label } from '../../domain/label';
import { PATH_CONFIG, type PathConfig } from '../../domain/path/pathConfig';
import { pathStatus, type PathInput, type PathView } from '../../domain/path/pathStatus';
import {
  drawPlacementTest,
  scorePlacementTest,
  type PlacementScore,
  type PlacementTest,
} from '../../domain/path/placementTest';
import { stepSessionWords } from '../../domain/path/stepSession';
import type { PathStep } from '../../domain/progressRecords';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import { studyDay } from '../../domain/srs/studyDay';
import type { StudyRepository } from '../../storage/studyRepository';
import { RECENT_SESSIONS_MS } from '../flashcards/flashcardSession';

export type PathStore = Pick<
  StudyRepository,
  'load' | 'pathProgress' | 'resultsSince' | 'applyPlacementTest'
>;

export interface PathDependencies {
  store: PathStore;
  srs: SrsDependencies;
  clock: () => Date;
  newId: () => string;
  config?: PathConfig;
}

/** A pinned label's path in one language (GAME_DESIGN.md 5.1). */
export interface PathSelection {
  cards: readonly Card[];
  label: Label;
  language: Language;
}

export interface LoadedPath {
  label: Label;
  language: Language;
  view: PathView;
  /** The words of the label in the language. */
  words: Card[];
  /** The words of a step session on this step (GAME_DESIGN.md 5.3). */
  stepWords: (step: PathStep) => string[];
  /** The words of a new placement test on this step, drawn at random (5.2). */
  placementWords: (step: PathStep) => string[];
  input: PathInput;
}

/** A placement test under way: its words, and when it started, to score its answers. */
export interface PendingPlacement {
  labelId: string;
  language: Language;
  test: PlacementTest;
  startedAt: string;
}

export interface PlacementOutcome extends PlacementScore {
  /** True when the test validated its step. */
  validated: boolean;
}

/** Reads the stored progress now and computes the path of the label in the language. */
export async function loadPath(
  { cards, label, language }: PathSelection,
  { store, srs, clock, newId, config = PATH_CONFIG }: PathDependencies,
): Promise<LoadedPath> {
  const now = clock();
  const [data, progress] = await Promise.all([
    store.load(new Date(now.getTime() - RECENT_SESSIONS_MS).toISOString()),
    store.pathProgress(label.id, language),
  ]);
  const words = selectCards(cards, { labelIds: [label.id], language });
  const input: PathInput = {
    cards: words,
    states: data.reviewStates,
    ...(progress === undefined ? {} : { progress }),
  };
  const stateOf = new Map(data.reviewStates.map((state) => [state.cardId, state]));
  const retrievability = (cardId: string) => {
    const state = stateOf.get(cardId);
    return state === undefined || state.reps === 0 ? 0 : srs.model.retrievability(state, now);
  };
  return {
    label,
    language,
    view: pathStatus(input, config),
    words,
    stepWords: (step) => stepSessionWords(step, input, retrievability, config),
    placementWords: (step) => drawPlacementTest(words, step, newId(), config).cardIds,
    input,
  };
}

/** "Passer l'étape (test)": the test starts now, on the words drawn for it. */
export function beginPlacement(
  { labelId, language }: { labelId: string; language: Language },
  test: PlacementTest,
  clock: () => Date,
): PendingPlacement {
  return { labelId, language, test, startedAt: clock().toISOString() };
}

/** Scores the test on the answers given since it started, and stores what it validated. */
export async function finishPlacement(
  pending: PendingPlacement,
  { store, srs, clock, config = PATH_CONFIG }: PathDependencies,
): Promise<PlacementOutcome> {
  const now = clock();
  const [results, data] = await Promise.all([
    store.resultsSince(pending.startedAt),
    store.load(new Date(now.getTime() - RECENT_SESSIONS_MS).toISOString()),
  ]);
  const score = scorePlacementTest(pending.test, results, config);
  const today = studyDay(now, data.progress?.lastActiveDate, srs);
  const events = await store.applyPlacementTest(pending.labelId, pending.language, score, today);
  return { ...score, validated: events.some(({ step }) => step === score.step) };
}
