import { describe, expectTypeOf, it } from 'vitest';
import type {
  Rating as StoredRating,
  ReviewStateRecord,
  Stage as StoredStage,
} from './progressRecords';
import type { Rating, ReviewState, Stage } from './srs/reviewState';

describe('progress records', () => {
  it('store exactly the review state that the spaced repetition computes', () => {
    expectTypeOf<ReviewStateRecord>().toEqualTypeOf<ReviewState>();
  });

  it('share the stages and ratings of the spaced repetition', () => {
    expectTypeOf<StoredStage>().toEqualTypeOf<Stage>();
    expectTypeOf<StoredRating>().toEqualTypeOf<Rating>();
  });
});
