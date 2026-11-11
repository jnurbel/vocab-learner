import { describe, expect, it } from 'vitest';
import { fitWithin, PHOTO_MAX_SIDE } from './imageSize';

describe('fitWithin', () => {
  it('reduces a large landscape photo so that its longer side is 1 500 pixels', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, PHOTO_MAX_SIDE)).toEqual({
      width: 1500,
      height: 1125,
    });
  });

  it('reduces a large portrait photo the same way, on its height', () => {
    expect(fitWithin({ width: 3024, height: 4032 }, PHOTO_MAX_SIDE)).toEqual({
      width: 1125,
      height: 1500,
    });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin({ width: 800, height: 600 }, PHOTO_MAX_SIDE)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('keeps at least one pixel on each side of a very thin image', () => {
    expect(fitWithin({ width: 30_000, height: 2 }, PHOTO_MAX_SIDE)).toEqual({
      width: 1500,
      height: 1,
    });
  });

  it('refuses an empty or invalid size', () => {
    expect(() => fitWithin({ width: 0, height: 10 }, PHOTO_MAX_SIDE)).toThrow(RangeError);
    expect(() => fitWithin({ width: Number.NaN, height: 10 }, PHOTO_MAX_SIDE)).toThrow(RangeError);
  });
});
