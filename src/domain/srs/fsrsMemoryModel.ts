import {
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs';
import type { FsrsSettings } from './config';
import type { MemoryModel } from './memoryModel';
import type { Rating, ReviewState } from './reviewState';

const gradeOf: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

const fsrsStateOf: Record<ReviewState['state'], State> = {
  new: State.New,
  review: State.Review,
  relearning: State.Relearning,
};

// Without short-term steps ts-fsrs never yields Learning; map it defensively all the same.
const stateOf: Record<State, ReviewState['state']> = {
  [State.New]: 'new',
  [State.Learning]: 'review',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

function toFsrsCard(state: ReviewState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    // ts-fsrs derives the elapsed time from last_review; these legacy fields are not read.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- still required by the v5 Card type
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: state.reps,
    lapses: state.lapses,
    state: fsrsStateOf[state.state],
    ...(state.lastReviewAt === undefined ? {} : { last_review: new Date(state.lastReviewAt) }),
  };
}

/** Memory model backed by ts-fsrs (MIT), reasoning in whole days. */
export function createFsrsMemoryModel(settings: FsrsSettings): MemoryModel {
  const scheduler = fsrs(
    generatorParameters({
      request_retention: settings.requestRetention,
      enable_short_term: settings.enableShortTerm,
      enable_fuzz: settings.enableFuzz,
      maximum_interval: settings.maximumIntervalDays,
    }),
  );
  return {
    review(state, rating, now) {
      const { card } = scheduler.next(toFsrsCard(state), now, gradeOf[rating]);
      return {
        due: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        state: stateOf[card.state],
        lastReviewAt: now.toISOString(),
      };
    },
    retrievability(state, now) {
      return scheduler.get_retrievability(toFsrsCard(state), now, false);
    },
  };
}
