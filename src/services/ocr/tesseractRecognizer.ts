import { createWorker, type LoggerMessage } from 'tesseract.js';
import { cleanRecognizedText } from '../../domain/photo/recognizedText';
import {
  RecognitionCancelled,
  type RecognitionOptions,
  type TextRecognizer,
} from './textRecognizer';

/** The reader's files, served by the app itself: the CSP only allows `connect-src 'self'`. */
export interface TesseractAssets {
  workerPath: string;
  /** A folder: the reader picks the build that the device supports (SIMD or not). */
  corePath: string;
  langPath: string;
}

const LANGUAGES = ['chi_sim', 'eng'];
/** The LSTM engine only: the languages served are the "best_int" LSTM models. */
const LSTM_ONLY = 1;

function progressOf({ status, progress }: Pick<LoggerMessage, 'status' | 'progress'>) {
  return { step: status === 'recognizing text' ? 'reading' : 'loading', progress } as const;
}

/** Settles as soon as the learner cancels, already rejected if they did. */
function whenCancelled(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new RecognitionCancelled());
    }
    signal.addEventListener('abort', () => {
      reject(new RecognitionCancelled());
    });
  });
}

/**
 * Text recognition by Tesseract.js (Apache-2.0), in a Web Worker, on the device: the image never
 * leaves it. A reader is started for each photo and freed afterwards, as it holds much memory.
 */
export function createTesseractRecognizer(assets: TesseractAssets): TextRecognizer {
  return {
    async recognize(image: Blob, { onProgress, signal }: RecognitionOptions): Promise<string> {
      const loading = createWorker(LANGUAGES, LSTM_ONLY, {
        ...assets,
        // A worker started from the app's own URL, not from a blob: the CSP stays unchanged.
        workerBlobURL: false,
        gzip: true,
        logger: (message) => {
          onProgress(progressOf(message));
        },
      });
      const cancelled = whenCancelled(signal);
      // A cancellation after the end is of no consequence.
      cancelled.catch(() => undefined);
      try {
        // The cancellation first: it wins over a reader loaded at the same time.
        const worker = await Promise.race([cancelled, loading]);
        const { data } = await Promise.race([cancelled, worker.recognize(image)]);
        return cleanRecognizedText(data.text);
      } finally {
        // Also frees a reader whose loading ends after a cancellation.
        loading.then(
          (worker) => worker.terminate(),
          () => undefined,
        );
      }
    },
  };
}
