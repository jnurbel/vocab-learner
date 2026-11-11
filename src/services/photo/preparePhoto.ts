import { fitWithin, PHOTO_MAX_SIDE, type ImageSize } from '../../domain/photo/imageSize';
import { failure, success, type Result } from '../../domain/result';

/** A decoded image, to release once drawn. */
export interface DecodedImage extends ImageSize {
  close(): void;
}

/** The browser's image APIs, injected so that tests can replace them. */
export interface PhotoEnvironment {
  decode(file: Blob): Promise<DecodedImage>;
  /** Draws the image at the given size on a blank canvas and returns the canvas as a new file. */
  redraw(image: DecodedImage, size: ImageSize): Promise<Blob>;
}

export type PhotoError = 'notAnImage' | 'tooLarge' | 'unreadable';

/** A photo larger than this is refused before it is decoded. */
export const PHOTO_MAX_BYTES = 30 * 1024 * 1024;

/**
 * Reduces a photo and redraws it on a canvas: the new file holds only pixels, without the
 * metadata of the original (EXIF: place, date, device). Nothing leaves the device.
 */
export async function preparePhoto(
  file: Blob,
  environment: PhotoEnvironment,
): Promise<Result<Blob, PhotoError>> {
  if (!file.type.startsWith('image/')) {
    return failure(['notAnImage']);
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return failure(['tooLarge']);
  }
  try {
    const image = await environment.decode(file);
    try {
      return success(await environment.redraw(image, fitWithin(image, PHOTO_MAX_SIDE)));
    } finally {
      image.close();
    }
  } catch {
    return failure(['unreadable']);
  }
}
