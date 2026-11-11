import {
  createFrenchSpelling,
  type FrenchSpelling,
  type SpellingResult,
} from '../../../domain/photo/frenchSpelling';
import type { ImageSize } from '../../../domain/photo/imageSize';
import { hasHan } from '../../../domain/photo/tableGrid';
import type { Box, Reading, Script } from '../../../domain/photo/photoBlocks';
import { lazyLoader } from '../../lazyLoader';
import type { PhotoAnalysis, Region } from '../photoReader';
import type { RecognitionProgress } from '../textRecognizer';
import { PADDLE_FILES, paddleFileUrl, type PaddleFile } from './paddleFiles';

/** What a recognition model read in a box. */
export interface RecognizedText {
  text: string;
  box: Box;
  confidence: number;
}

export interface Detector {
  run(canvas: unknown): Promise<Box[]>;
}

export interface Recognizer {
  run(canvas: unknown, boxes: Box[]): Promise<RecognizedText[]>;
}

/** A photo decoded on a canvas, to release once read. */
export interface DecodedPhoto {
  canvas: unknown;
  size: ImageSize;
  close(): void;
}

/** PaddleOCR and the browser, injected so that tests can replace them. */
export interface PaddleDependencies {
  /** Fetches a file of the app, telling how many bytes arrived so far. */
  fetchFile(url: string, onBytes: (bytes: number) => void): Promise<ArrayBuffer>;
  createDetector(model: ArrayBuffer): Promise<Detector>;
  createRecognizer(model: ArrayBuffer, dictionary: string[]): Promise<Recognizer>;
  decode(image: Blob): Promise<DecodedPhoto>;
}

export interface PaddleEngine {
  analyze(image: Blob, onProgress: (progress: RecognitionProgress) => void): Promise<PhotoAnalysis>;
  readRegions(
    image: Blob,
    regions: readonly Region[],
    onProgress: (progress: RecognitionProgress) => void,
  ): Promise<Reading[]>;
  correctFrench(texts: readonly string[]): Promise<SpellingResult[]>;
}

interface Models {
  detector: Detector;
  recognizers: Record<Script, Recognizer>;
}

const MODEL_FILES: readonly PaddleFile[] = [
  'detection',
  'chinese',
  'chineseDictionary',
  'latin',
  'latinDictionary',
];
const NOTHING_READ: Reading = { text: '', confidence: 0 };
/** A block read as hanzi this surely is not read with the Latin model. */
const SURE_HANZI = 0.8;

/** How much two boxes cover each other, from 0 (apart) to 1 (the same). */
function overlap(first: Box, second: Box): number {
  const width =
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const height =
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  if (width <= 0 || height <= 0) {
    return 0;
  }
  const shared = width * height;
  return shared / (first.width * first.height + second.width * second.height - shared);
}

/** A reading is the one of a box when they cover each other at least this much. */
const SAME_BOX = 0.5;

function dictionaryOf(file: ArrayBuffer): string[] {
  return new TextDecoder().decode(file).split(/\r?\n/);
}

/** What a model read in the given boxes. */
function readBoxes(
  recognizer: Recognizer,
  canvas: unknown,
  boxes: readonly Box[],
): Promise<RecognizedText[]> {
  return recognizer.run(canvas, [...boxes]);
}

/**
 * What a model read in a box: the reading whose box covers it most, as the model may give the
 * box back rounded (scaled); nothing when the model dropped the box (too small, or blank).
 */
function readingOf(readings: readonly RecognizedText[], box: Box): Reading {
  let best: RecognizedText | undefined;
  let bestOverlap = SAME_BOX;
  for (const reading of readings) {
    const covered = overlap(reading.box, box);
    if (covered >= bestOverlap) {
      best = reading;
      bestOverlap = covered;
    }
  }
  return best === undefined ? NOTHING_READ : { text: best.text, confidence: best.confidence };
}

/**
 * Text recognition by PaddleOCR (PP-OCRv5 mobile models, Apache-2.0) on the device, meant to run
 * in a Web Worker: the photo never leaves it. The models are fetched from the app on first use,
 * then kept for the following photos.
 */
export function createPaddleEngine(
  appBase: string,
  dependencies: PaddleDependencies,
): PaddleEngine {
  // Set by each reading before the models are loaded, for the progress of their download.
  let report: (progress: RecognitionProgress) => void;
  const total = MODEL_FILES.reduce((sum, file) => sum + PADDLE_FILES[file].bytes, 0);

  const loadModels = lazyLoader(async (): Promise<Models> => {
    const arrived = new Map<PaddleFile, number>();
    const fetchModel = (file: PaddleFile) =>
      dependencies.fetchFile(paddleFileUrl(appBase, file), (bytes) => {
        arrived.set(file, bytes);
        const sum = [...arrived.values()].reduce((all, part) => all + part, 0);
        report({ step: 'loading', progress: Math.min(1, sum / total) });
      });
    const [detection, chinese, chineseDictionary, latin, latinDictionary] = await Promise.all([
      fetchModel('detection'),
      fetchModel('chinese'),
      fetchModel('chineseDictionary'),
      fetchModel('latin'),
      fetchModel('latinDictionary'),
    ]);
    const [detector, chineseReader, latinReader] = await Promise.all([
      dependencies.createDetector(detection),
      dependencies.createRecognizer(chinese, dictionaryOf(chineseDictionary)),
      dependencies.createRecognizer(latin, dictionaryOf(latinDictionary)),
    ]);
    return { detector, recognizers: { chinese: chineseReader, latin: latinReader } };
  });

  const loadSpelling = lazyLoader(async (): Promise<FrenchSpelling> => {
    const words = await dependencies.fetchFile(
      paddleFileUrl(appBase, 'frenchWords'),
      () => undefined,
    );
    return createFrenchSpelling(new TextDecoder().decode(words).split('\n'));
  });

  async function withPhoto<T>(
    image: Blob,
    onProgress: (progress: RecognitionProgress) => void,
    read: (models: Models, canvas: unknown, size: ImageSize) => Promise<T>,
  ): Promise<T> {
    report = onProgress;
    const models = await loadModels();
    const photo = await dependencies.decode(image);
    try {
      return await read(models, photo.canvas, photo.size);
    } finally {
      photo.close();
    }
  }

  return {
    analyze: (image, onProgress) =>
      withPhoto(image, onProgress, async ({ detector, recognizers }, canvas, size) => {
        onProgress({ step: 'reading', progress: 0 });
        const boxes = await detector.run(canvas);
        onProgress({ step: 'reading', progress: 0.3 });
        const chinese = await readBoxes(recognizers.chinese, canvas, boxes);
        onProgress({ step: 'reading', progress: 0.7 });
        // Hanzi read surely need no Latin reading: it would only cost time.
        const latinBoxes = boxes.filter((box) => {
          const reading = readingOf(chinese, box);
          return !(hasHan(reading.text) && reading.confidence >= SURE_HANZI);
        });
        const latin = await readBoxes(recognizers.latin, canvas, latinBoxes);
        onProgress({ step: 'reading', progress: 1 });
        return {
          size,
          blocks: boxes.map((box) => ({
            box,
            chinese: readingOf(chinese, box),
            latin: readingOf(latin, box),
          })),
        };
      }),
    readRegions: (image, regions, onProgress) =>
      withPhoto(image, onProgress, async ({ recognizers }, canvas) => {
        onProgress({ step: 'reading', progress: 0 });
        const byScript = async (script: Script) => {
          const boxes = regions.filter((region) => region.script === script).map(({ box }) => box);
          return readBoxes(recognizers[script], canvas, boxes);
        };
        const read = { chinese: await byScript('chinese'), latin: await byScript('latin') };
        onProgress({ step: 'reading', progress: 1 });
        return regions.map(({ box, script }) => readingOf(read[script], box));
      }),
    correctFrench: async (texts) => {
      const correct = await loadSpelling();
      return texts.map(correct);
    },
  };
}
