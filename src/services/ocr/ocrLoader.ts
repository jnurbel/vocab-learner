import { createPaddleReader } from './paddle/paddleReader';
import type { PhotoReader } from './photoReader';

/**
 * The on-device photo reader: PaddleOCR in a Web Worker, a module of the app (the CSP allows
 * `worker-src 'self'`), started on the first photo read.
 */
export function createPhotoReader(): PhotoReader {
  return createPaddleReader(
    () =>
      new Worker(new URL('./paddle/paddle.worker.ts', import.meta.url), {
        type: 'module',
        name: 'photo-reader',
      }),
  );
}
