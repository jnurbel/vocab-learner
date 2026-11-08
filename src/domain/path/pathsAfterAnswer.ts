import type { Card } from '../card';
import { selectCards } from '../cardSelection';
import type { Label } from '../label';
import type { PathProgressRecord, SessionResultRecord } from '../progressRecords';
import type { ReviewState } from '../srs/reviewState';
import { advancePath, type PathStepValidatedEvent } from './advancePath';
import type { PathConfig } from './pathConfig';
import type { PathInput } from './pathStatus';
import { recordStepAttempt } from './stepAttempts';

/** What the paths are updated from after one answer, whatever its exercise. */
export interface PathsInput {
  answer: Pick<SessionResultRecord, 'cardId' | 'exercise' | 'outcome'>;
  cards: readonly Card[];
  labels: readonly Label[];
  /** The review states after the answer. */
  states: readonly ReviewState[];
  /** The paths stored so far. */
  paths: readonly PathProgressRecord[];
  toneEchoEligible?: PathInput['toneEchoEligible'];
}

export interface PathsUpdate {
  /** Only the paths changed, to be stored. */
  paths: PathProgressRecord[];
  events: PathStepValidatedEvent[];
}

type PathConfigUsed = Parameters<typeof advancePath>[1] & Pick<PathConfig, 'toneEchoWindow'>;

/**
 * Every answer feeds the path of each pinned label of its word, in the word's language
 * (GAME_DESIGN.md 5.1: sessions, step sessions and free practice alike).
 */
export function pathsAfterAnswer(input: PathsInput, config: PathConfigUsed): PathsUpdate {
  const { answer, cards, labels, paths } = input;
  const word = cards.find(({ id }) => id === answer.cardId);
  if (word === undefined) {
    return { paths: [], events: [] };
  }
  const changed: PathProgressRecord[] = [];
  const events: PathStepValidatedEvent[] = [];
  for (const label of labels) {
    if (!label.isFocus || !word.labelIds.includes(label.id)) {
      continue;
    }
    const stored = paths.find(
      (path) => path.labelId === label.id && path.language === word.language,
    ) ?? { labelId: label.id, language: word.language };
    const recorded =
      answer.exercise === undefined
        ? stored
        : recordStepAttempt(stored, word.id, answer.exercise, answer.outcome, config);
    const advanced = advancePath(
      {
        cards: selectCards(cards, { labelIds: [label.id], language: word.language }),
        states: input.states,
        progress: recorded,
        ...(input.toneEchoEligible === undefined
          ? {}
          : { toneEchoEligible: input.toneEchoEligible }),
      },
      config,
    );
    if (advanced.progress !== stored) {
      changed.push(advanced.progress);
      events.push(...advanced.events);
    }
  }
  return { paths: changed, events };
}
