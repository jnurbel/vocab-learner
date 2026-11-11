/** Where a recognition stands: fetching the reader, reading, then correcting the words read. */
export interface RecognitionProgress {
  step: 'loading' | 'reading' | 'correcting';
  /** From 0 to 1, within the step. */
  progress: number;
}

export interface RecognitionOptions {
  onProgress: (progress: RecognitionProgress) => void;
  /** Aborting stops the reading and frees its memory. */
  signal: AbortSignal;
}

/** Reads the printed text of an image, on the device. Injected so that tests can replace it. */
export interface TextRecognizer {
  recognize(image: Blob, options: RecognitionOptions): Promise<string>;
}

/** Thrown by `recognize` once the learner cancels. */
export class RecognitionCancelled extends Error {
  constructor() {
    super('Text recognition cancelled');
    this.name = 'RecognitionCancelled';
  }
}
