import { describe, expect, it, vi } from 'vitest';
import type { Box } from '../../../domain/photo/photoBlocks';
import type { RecognitionProgress } from '../textRecognizer';
import { createPaddleEngine, type PaddleDependencies, type RecognizedText } from './paddleEngine';

const appBase = 'https://example.test/vocab-learner/';
const first: Box = { x: 10, y: 10, width: 100, height: 40 };
const second: Box = { x: 200, y: 10, width: 120, height: 40 };

/** Fake models: the Chinese one reads hanzi, the Latin one reads letters. */
function fakeDependencies(options: { failFirstFetch?: boolean } = {}) {
  const fetched: string[] = [];
  const closed = vi.fn();
  let fail = options.failFirstFetch === true;
  const readers: Record<string, (box: Box) => RecognizedText | undefined> = {
    zh: (box) => ({ box, text: box === first ? '控制' : 'kong', confidence: 0.9 }),
    latin: (box) => (box === first ? undefined : { box, text: 'contrôler', confidence: 0.8 }),
  };
  const createDetector = vi.fn(() =>
    Promise.resolve({ run: () => Promise.resolve([first, second]) }),
  );
  const createRecognizer = vi.fn((model: ArrayBuffer, dictionary: string[]) => {
    const name = new TextDecoder().decode(model);
    expect(dictionary).toEqual(['a', 'b']);
    return Promise.resolve({
      run: (_canvas: unknown, boxes: Box[]) =>
        Promise.resolve(boxes.flatMap((box) => readers[name]?.(box) ?? [])),
    });
  });
  const dependencies: PaddleDependencies = {
    fetchFile: vi.fn((url: string, onBytes: (bytes: number) => void) => {
      if (fail) {
        fail = false;
        return Promise.reject(new Error('offline'));
      }
      fetched.push(url.replace(appBase, ''));
      onBytes(1000);
      const name = url.includes('latin') ? 'latin' : 'zh';
      return Promise.resolve(new TextEncoder().encode(url.endsWith('.txt') ? 'a\nb' : name).buffer);
    }),
    createDetector,
    createRecognizer,
    decode: vi.fn(() =>
      Promise.resolve({ canvas: 'canvas', size: { width: 400, height: 80 }, close: closed }),
    ),
  };
  return { dependencies, fetched, closed, createDetector, createRecognizer };
}

describe('createPaddleEngine', () => {
  it('reads each block with both models, from the files served by the app itself', async () => {
    const { dependencies, fetched, closed } = fakeDependencies();
    const engine = createPaddleEngine(appBase, dependencies);

    const analysis = await engine.analyze(new Blob(['photo']), () => undefined);

    expect(analysis).toEqual({
      size: { width: 400, height: 80 },
      blocks: [
        {
          box: first,
          chinese: { text: '控制', confidence: 0.9 },
          latin: { text: '', confidence: 0 },
        },
        {
          box: second,
          chinese: { text: 'kong', confidence: 0.9 },
          latin: { text: 'contrôler', confidence: 0.8 },
        },
      ],
    });
    expect(fetched).toEqual([
      'paddle/models/PP-OCRv5_mobile_det_infer.onnx',
      'paddle/models/PP-OCRv5_mobile_rec_infer.onnx',
      'paddle/models/ppocrv5_dict.txt',
      'paddle/models/latin_PP-OCRv5_mobile_rec_infer.onnx',
      'paddle/models/ppocrv5_latin_dict.txt',
    ]);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('loads the models once for all the photos read', async () => {
    const { dependencies, createDetector, createRecognizer } = fakeDependencies();
    const engine = createPaddleEngine(appBase, dependencies);

    await engine.analyze(new Blob(['photo']), () => undefined);
    await engine.analyze(new Blob(['photo']), () => undefined);

    expect(createDetector).toHaveBeenCalledOnce();
    expect(createRecognizer).toHaveBeenCalledTimes(2);
  });

  it('reports the download of the models, then the reading', async () => {
    const { dependencies } = fakeDependencies();
    const progress: RecognitionProgress[] = [];

    await createPaddleEngine(appBase, dependencies).analyze(new Blob(['photo']), (step) =>
      progress.push(step),
    );

    expect(progress[0]).toEqual({ step: 'loading', progress: expect.any(Number) as number });
    expect(progress.filter(({ step }) => step === 'loading').at(-1)?.progress).toBeLessThanOrEqual(
      1,
    );
    expect(progress.at(-1)).toEqual({ step: 'reading', progress: 1 });
  });

  it('reads the regions cut by the learner, each with the model of its column, in order', async () => {
    const { dependencies } = fakeDependencies();

    const readings = await createPaddleEngine(appBase, dependencies).readRegions(
      new Blob(['photo']),
      [
        { box: second, script: 'latin' },
        { box: first, script: 'chinese' },
        { box: first, script: 'latin' },
      ],
      () => undefined,
    );

    expect(readings).toEqual([
      { text: 'contrôler', confidence: 0.8 },
      { text: '控制', confidence: 0.9 },
      { text: '', confidence: 0 },
    ]);
  });

  it('corrects French meanings with the dictionary served by the app, fetched once', async () => {
    const { dependencies, fetched } = fakeDependencies();
    const engine = createPaddleEngine(appBase, dependencies);

    expect(await engine.correctFrench(['b'])).toEqual([{ text: 'b', certain: true }]);
    await engine.correctFrench(['a']);

    expect(fetched).toEqual(['paddle/fr-words.txt']);
  });

  it('tries again to load the models after a failure, e.g. back online', async () => {
    const { dependencies } = fakeDependencies({ failFirstFetch: true });
    const engine = createPaddleEngine(appBase, dependencies);

    await expect(engine.analyze(new Blob(['photo']), () => undefined)).rejects.toThrow('offline');
    await expect(engine.analyze(new Blob(['photo']), () => undefined)).resolves.toBeDefined();
  });
});
