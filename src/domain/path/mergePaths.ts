import type { PathProgressRecord, PathStep } from '../progressRecords';

type Attempts = Partial<Record<PathStep, Record<string, boolean>>>;

/**
 * Two labels merged (DESIGN.md 5): the label kept inherits the validated steps and the best
 * score of the absorbed one, which are never lost. Where both hold a result for a word, the
 * kept label's own wins.
 */
export function mergePaths(
  absorbed: PathProgressRecord,
  kept: PathProgressRecord,
): PathProgressRecord {
  const steps = { ...absorbed.steps, ...kept.steps };
  const stepAttempts = mergeAttempts(absorbed.stepAttempts ?? {}, kept.stepAttempts ?? {});
  const shuffledSentences = { ...absorbed.shuffledSentences, ...kept.shuffledSentences };
  const best = Math.max(absorbed.finalChallengeBest ?? -1, kept.finalChallengeBest ?? -1);
  const toneEchoRecent = kept.toneEchoRecent ?? absorbed.toneEchoRecent;
  return {
    labelId: kept.labelId,
    language: kept.language,
    ...(Object.keys(steps).length === 0 ? {} : { steps }),
    ...(Object.keys(stepAttempts).length === 0 ? {} : { stepAttempts }),
    ...(best < 0 ? {} : { finalChallengeBest: best }),
    ...(toneEchoRecent === undefined ? {} : { toneEchoRecent }),
    ...(Object.keys(shuffledSentences).length === 0 ? {} : { shuffledSentences }),
  };
}

function mergeAttempts(absorbed: Attempts, kept: Attempts): Attempts {
  const merged: Attempts = { ...absorbed };
  for (const [step, attempts] of Object.entries(kept) as [PathStep, Record<string, boolean>][]) {
    merged[step] = { ...absorbed[step], ...attempts };
  }
  return merged;
}
