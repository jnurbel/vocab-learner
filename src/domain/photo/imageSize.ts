export interface ImageSize {
  width: number;
  height: number;
}

/** Enough for printed text to be read, and far lighter than a phone photo. */
export const PHOTO_MAX_SIDE = 1500;

/** The size of an image reduced, never enlarged, so that its longer side fits `maxSide`. */
export function fitWithin({ width, height }: ImageSize, maxSide: number): ImageSize {
  if (!(width > 0 && height > 0)) {
    throw new RangeError(`Invalid image size: ${String(width)} × ${String(height)}`);
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
