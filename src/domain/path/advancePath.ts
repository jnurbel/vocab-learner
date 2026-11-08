import type { Language } from '../card';
import type { PathProgressRecord, PathStep } from '../progressRecords';
import type { PathConfig } from './pathConfig';
import { pathStatus, type PathInput } from './pathStatus';

/** A step of a label's path was validated (GAME_DESIGN.md 9.1); the game gives its points. */
export interface PathStepValidatedEvent {
  type: 'PathStepValidated';
  labelId: string;
  language: Language;
  step: PathStep;
  via: 'progress' | 'placementTest';
}

export interface PathAdvance {
  progress: PathProgressRecord;
  events: PathStepValidatedEvent[];
}

type PathConfigUsed = Parameters<typeof pathStatus>[1] & Pick<PathConfig, 'stepPassRatio'>;

/**
 * Validates the current step once its criterion is met, then the next ones already met, in
 * order (GAME_DESIGN.md 5.2). The final challenge is validated by its own score only.
 */
export function advancePath(
  input: PathInput & { progress: PathProgressRecord },
  config: PathConfigUsed,
): PathAdvance {
  let progress = input.progress;
  const events: PathStepValidatedEvent[] = [];
  for (;;) {
    const { steps, current } = pathStatus({ ...input, progress }, config);
    const step = steps.find((candidate) => candidate.step === current);
    if (step === undefined || step.step === 'finalChallenge' || !step.met) {
      return { progress, events };
    }
    progress = validateStep(progress, step.step);
    events.push(validatedEvent(progress, step.step, 'progress'));
  }
}

export function validateStep(progress: PathProgressRecord, step: PathStep): PathProgressRecord {
  return { ...progress, steps: { ...progress.steps, [step]: 'validated' } };
}

export function validatedEvent(
  { labelId, language }: PathProgressRecord,
  step: PathStep,
  via: PathStepValidatedEvent['via'],
): PathStepValidatedEvent {
  return { type: 'PathStepValidated', labelId, language, step, via };
}
