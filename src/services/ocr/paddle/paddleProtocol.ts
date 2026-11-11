import type { SpellingResult } from '../../../domain/photo/frenchSpelling';
import type { Reading } from '../../../domain/photo/photoBlocks';
import type { PhotoAnalysis, Region } from '../photoReader';
import type { RecognitionProgress } from '../textRecognizer';

/** What the page asks the photo reader worker. */
export type PaddleRequest =
  | { id: number; kind: 'analyze'; image: Blob }
  | { id: number; kind: 'readRegions'; image: Blob; regions: Region[] }
  | { id: number; kind: 'correctFrench'; texts: string[] };

export type PaddleResult = PhotoAnalysis | Reading[] | SpellingResult[];

/** What the worker answers, for the request of the same id. */
export type PaddleResponse =
  | { id: number; kind: 'progress'; progress: RecognitionProgress }
  | { id: number; kind: 'done'; result: PaddleResult }
  | { id: number; kind: 'failed'; message: string };
