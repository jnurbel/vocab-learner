import type { SpellingResult } from '../../domain/photo/frenchSpelling';
import type { ImageSize } from '../../domain/photo/imageSize';
import type { Box, DetectedBlock, Reading, Script } from '../../domain/photo/photoBlocks';
import type { RecognitionOptions } from './textRecognizer';

/** The text blocks found on a photo, each read by both models. */
export interface PhotoAnalysis {
  size: ImageSize;
  blocks: DetectedBlock[];
}

/** A part of the photo to read with one model: a piece of a block cut by a column separator. */
export interface Region {
  box: Box;
  script: Script;
}

/**
 * Reads photos on the device: finds the blocks of text, reads them with the Chinese and the Latin
 * models, reads again the regions the learner cut, and corrects French meanings. Injected so that
 * tests can replace it.
 */
export interface PhotoReader {
  analyze(image: Blob, options: RecognitionOptions): Promise<PhotoAnalysis>;
  /** One reading per region, in the same order. */
  readRegions(
    image: Blob,
    regions: readonly Region[],
    options: RecognitionOptions,
  ): Promise<Reading[]>;
  /** One result per text, in the same order; the dictionary is fetched on first use. */
  correctFrench(texts: readonly string[], options: RecognitionOptions): Promise<SpellingResult[]>;
  /** Frees the memory held by the models. */
  dispose(): void;
}
