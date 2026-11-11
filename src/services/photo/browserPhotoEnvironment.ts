import type { Box } from '../../domain/photo/photoBlocks';
import type { DecodedImage, PhotoEnvironment } from './preparePhoto';

/** JPEG keeps a photo light; the quality stays high enough for small printed characters. */
const JPEG_QUALITY = 0.92;

/**
 * The browser's canvas: the photo is decoded upright (EXIF orientation applied), then drawn on a
 * blank canvas whose export holds pixels only. Exercised by the end-to-end tests.
 */
export const browserPhotoEnvironment: PhotoEnvironment = {
  decode: (file) => createImageBitmap(file, { imageOrientation: 'from-image' }),
  redraw: (image: DecodedImage, { width, height }) =>
    new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null || !(image instanceof ImageBitmap)) {
        reject(new Error('Cannot draw the photo'));
        return;
      }
      // A transparent image (PNG) is read on white, as printed text.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob === null) {
            reject(new Error('Cannot export the photo'));
          } else {
            resolve(blob);
          }
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    }),
};

/**
 * Cuts a band of a photo, for the thumbnail of a word read on it: the photo is redrawn on a canvas
 * the size of the band. Exercised by the end-to-end tests.
 */
export async function cropPhoto(photo: Blob, { x, y, width, height }: Box): Promise<Blob> {
  const image = await createImageBitmap(photo);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    canvas
      .getContext('2d')
      ?.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob === null) {
            reject(new Error('Cannot export the line'));
          } else {
            resolve(blob);
          }
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    });
  } finally {
    image.close();
  }
}
