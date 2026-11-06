import type { Rating, ReviewState } from './reviewState';

/** The fields of a ReviewState that the memory model computes on a rated answer. */
export type MemoryUpdate = Pick<
  ReviewState,
  'due' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'state'
> & { lastReviewAt: string };

/**
 * Memory model behind the spaced repetition: injected so that the library (ts-fsrs today)
 * can be replaced, like PinyinGenerator. Implementations must be pure: the clock is a parameter.
 */
export interface MemoryModel {
  review(state: ReviewState, rating: Rating, now: Date): MemoryUpdate;
  /** Estimated probability, from 0 to 1, of recalling the word at `now`. */
  retrievability(state: ReviewState, now: Date): number;
}
