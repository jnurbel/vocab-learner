import type { ExerciseType, PathProgressRecord, SessionOutcome } from '../progressRecords';
import type { PathConfig } from './pathConfig';
import { stepOfExercise } from './pathSteps';

/**
 * Keeps the last result of a word in the step of the exercise (GAME_DESIGN.md 5.1): only a
 * plain `correct` validates. toneEcho tests a sound and sentenceShuffle a sentence: they are
 * kept apart from the word attempts of their step, which bridgeMatch and sentenceListen own.
 */
export function recordStepAttempt(
  progress: PathProgressRecord,
  cardId: string,
  exercise: ExerciseType,
  outcome: SessionOutcome,
  config: Pick<PathConfig, 'toneEchoWindow'>,
): PathProgressRecord {
  const step = stepOfExercise(exercise);
  if (step === undefined) {
    return progress;
  }
  const success = outcome === 'correct';
  if (exercise === 'toneEcho') {
    const recent = [...(progress.toneEchoRecent ?? []), success];
    return { ...progress, toneEchoRecent: recent.slice(-config.toneEchoWindow) };
  }
  if (exercise === 'sentenceShuffle') {
    return { ...progress, shuffledSentences: withKey(progress.shuffledSentences, cardId, success) };
  }
  const attempts = progress.stepAttempts ?? {};
  return {
    ...progress,
    stepAttempts: { ...attempts, [step]: withKey(attempts[step], cardId, success) },
  };
}

/** A computed key defines an own property, even `__proto__`: never the prototype. */
function withKey(
  record: Readonly<Record<string, boolean>> | undefined,
  key: string,
  value: boolean,
): Record<string, boolean> {
  return { ...record, [key]: value };
}
