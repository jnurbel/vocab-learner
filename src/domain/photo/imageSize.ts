export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Enough for handwritten hanzi to be read (a notebook page read 22 of 23 words at this size,
 * 20 at 1 500 pixels), and lighter than a phone photo.
 */
export const PHOTO_MAX_SIDE = 2500;

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
