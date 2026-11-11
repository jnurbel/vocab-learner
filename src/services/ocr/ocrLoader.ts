import { lazyLoader } from '../lazyLoader';
import type { TesseractAssets } from './tesseractRecognizer';
import type { TextRecognizer } from './textRecognizer';

/** The files of the reader, served by the app (see config/tesseractAssets.ts). */
export function tesseractAssetUrls(appBase: string): TesseractAssets {
  const url = (path: string) => new URL(`tesseract/${path}`, appBase).href;
  return {
    workerPath: url('worker.min.js'),
    corePath: url('core'),
    langPath: url('lang'),
  };
}

/**
 * Tesseract.js and its languages are large: they are fetched as separate files, only when a
 * first photo is read, and from the app itself.
 */
export const loadTextRecognizer: () => Promise<TextRecognizer> = lazyLoader(async () => {
  const { createTesseractRecognizer } = await import('./tesseractRecognizer');
  return createTesseractRecognizer(
    tesseractAssetUrls(new URL(import.meta.env.BASE_URL, document.baseURI).href),
  );
});
