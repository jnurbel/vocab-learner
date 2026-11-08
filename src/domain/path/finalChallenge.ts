import type { Card, Language } from '../card';
import type { PathProgressRecord, SessionOutcome } from '../progressRecords';
import { createRng } from '../srs/random';
import { validateStep } from './advancePath';
import type { PathConfig } from './pathConfig';

/** The three sections of the final challenge, in the order of a real test (GAME_DESIGN.md 5.4). */
export type ChallengeSection = 'listening' | 'dictation' | 'translation';

export const CHALLENGE_SECTIONS: readonly ChallengeSection[] = Object.freeze([
  'listening',
  'dictation',
  'translation',
]);

export interface ChallengePart {
  section: ChallengeSection;
  cardIds: string[];
}

export interface ChallengeAnswer {
  section: ChallengeSection;
  outcome: SessionOutcome;
}

export interface SectionScore {
  correct: number;
  total: number;
}

export interface ChallengeScore {
  /** Out of 20, to the half point. */
  score20: number;
  passed: boolean;
  sections: Record<ChallengeSection, SectionScore>;
}

/** The final challenge of a label ended (GAME_DESIGN.md 9.1): a first success earns points. */
export interface FinalChallengeFinishedEvent {
  type: 'FinalChallengeFinished';
  labelId: string;
  language: Language;
  score20: number;
  passed: boolean;
  firstPass: boolean;
}

/**
 * The words of the challenge: at most `finalChallengeMaxWords`, the least remembered first,
 * each asked once in one section. The seed (the day) makes a new attempt that day the same.
 */
export function composeFinalChallenge(
  cards: readonly Card[],
  retrievability: (cardId: string) => number,
  seed: string,
  config: Pick<PathConfig, 'finalChallengeMaxWords' | 'finalChallengeMix'>,
): ChallengePart[] {
  const drawn = (id: string) => createRng(`${seed}:${id}`)();
  // Sorted by id first: the sorts below are stable, so the order of the input never matters.
  const chosen = [...cards]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id }) => ({ id, recall: retrievability(id), draw: drawn(id) }))
    .sort((a, b) => a.recall - b.recall || a.draw - b.draw)
    .slice(0, config.finalChallengeMaxWords)
    .sort((a, b) => a.draw - b.draw)
    .map(({ id }) => id);
  const listening = Math.round(chosen.length * config.finalChallengeMix.listening);
  const dictation = Math.round(chosen.length * config.finalChallengeMix.dictation);
  return [
    { section: 'listening', cardIds: chosen.slice(0, listening) },
    { section: 'dictation', cardIds: chosen.slice(listening, listening + dictation) },
    { section: 'translation', cardIds: chosen.slice(listening + dictation) },
  ];
}

/**
 * `score20 = round(40 × points / n) / 2`, a right answer being 1 point and an almost right one
 * half a point; a question left unanswered counts as wrong. Passed from 16 out of 20.
 */
export function scoreFinalChallenge(
  answers: readonly ChallengeAnswer[],
  questions: number,
  config: Pick<PathConfig, 'finalChallengePassScore20'>,
): ChallengeScore {
  const sections = Object.fromEntries(
    CHALLENGE_SECTIONS.map((section) => [section, { correct: 0, total: 0 }]),
  ) as Record<ChallengeSection, SectionScore>;
  let points = 0;
  for (const { section, outcome } of answers) {
    const score = sections[section];
    score.total += 1;
    if (outcome === 'correct') {
      score.correct += 1;
      points += 1;
    } else if (outcome === 'almost') {
      points += 0.5;
    }
  }
  const score20 = questions === 0 ? 0 : Math.round((40 * points) / questions) / 2;
  return { score20, passed: score20 >= config.finalChallengePassScore20, sections };
}

/** "Prêt pour le contrôle": the final challenge of the label was passed once (5.4). */
export function isReadyForExam(
  progress: PathProgressRecord | undefined,
  config: Pick<PathConfig, 'finalChallengePassScore20'>,
): boolean {
  return (
    progress?.steps?.finalChallenge === 'validated' ||
    (progress?.finalChallengeBest ?? 0) >= config.finalChallengePassScore20
  );
}

/** Keeps the best score; a success validates the last step of the path for good. */
export function recordFinalChallenge(
  progress: PathProgressRecord,
  score20: number,
  config: Pick<PathConfig, 'finalChallengePassScore20'>,
): { progress: PathProgressRecord; event: FinalChallengeFinishedEvent } {
  const pass = config.finalChallengePassScore20;
  const passed = score20 >= pass;
  const passedBefore =
    progress.steps?.finalChallenge === 'validated' || (progress.finalChallengeBest ?? 0) >= pass;
  const best = {
    ...progress,
    finalChallengeBest: Math.max(progress.finalChallengeBest ?? 0, score20),
  };
  const { labelId, language } = progress;
  return {
    progress: passed ? validateStep(best, 'finalChallenge') : best,
    event: {
      type: 'FinalChallengeFinished',
      labelId,
      language,
      score20,
      passed,
      firstPass: passed && !passedBefore,
    },
  };
}
