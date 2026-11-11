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
