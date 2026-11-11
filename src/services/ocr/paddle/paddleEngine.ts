import {
  createFrenchSpelling,
  type FrenchSpelling,
  type SpellingResult,
} from '../../../domain/photo/frenchSpelling';
import type { ImageSize } from '../../../domain/photo/imageSize';
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

function boxKey({ x, y, width, height }: Box): string {
  return [x, y, width, height].join(',');
}

function dictionaryOf(file: ArrayBuffer): string[] {
  return new TextDecoder().decode(file).split(/\r?\n/);
}

/** The readings of a model, by box. */
async function readBoxes(
  recognizer: Recognizer,
  canvas: unknown,
  boxes: readonly Box[],
): Promise<Map<string, Reading>> {
  const found = await recognizer.run(canvas, [...boxes]);
  return new Map(found.map(({ box, text, confidence }) => [boxKey(box), { text, confidence }]));
}

/** What a model read in a box; nothing when it dropped the box (too small, or blank). */
function readingOf(readings: ReadonlyMap<string, Reading>, box: Box): Reading {
  return readings.get(boxKey(box)) ?? NOTHING_READ;
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
        const latin = await readBoxes(recognizers.latin, canvas, boxes);
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
