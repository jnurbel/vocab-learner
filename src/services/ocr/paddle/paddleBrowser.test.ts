import { afterEach, describe, expect, it, vi } from 'vitest';

const ort = vi.hoisted(() => ({
  env: { wasm: {} },
  InferenceSession: { create: vi.fn((model: Uint8Array) => Promise.resolve({ model })) },
}));
const paddle = vi.hoisted(() => ({
  DetectionService: vi.fn(function (this: { run: unknown }) {
    this.run = (canvas: unknown) => Promise.resolve([{ x: 1, y: 2, width: 3, height: 4, canvas }]);
  }),
  RecognitionService: vi.fn(function (this: { run: unknown }) {
    this.run = (...args: unknown[]) => Promise.resolve(args);
  }),
}));

vi.mock('onnxruntime-web', () => ort);
vi.mock('ppu-paddle-ocr/web', () => paddle);

const { browserPaddleDependencies, fetchFile } = await import('./paddleBrowser');

const appBase = 'https://example.test/vocab-learner/';

afterEach(() => {
  vi.unstubAllGlobals();
});

function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => {
        controller.enqueue(new TextEncoder().encode(chunk));
      });
      controller.close();
    },
  });
}

describe('fetchFile', () => {
  it('fetches a file of the app, telling how many bytes have arrived', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(streamOf(['ab', 'cde'])))),
    );
    const arrived: number[] = [];

    const file = await fetchFile(`${appBase}paddle/x.txt`, (bytes) => arrived.push(bytes));

    expect(new TextDecoder().decode(file)).toBe('abcde');
    expect(arrived).toEqual([2, 5]);
  });

  it('fails on a missing file, e.g. offline before the first use', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    );

    await expect(fetchFile(`${appBase}paddle/x.txt`, () => undefined)).rejects.toThrow(
      'Cannot fetch',
    );
  });
});

describe('browserPaddleDependencies', () => {
  it('runs the models on one thread of WebAssembly, served by the app, never a CDN', async () => {
    const dependencies = browserPaddleDependencies(appBase);

    const detector = await dependencies.createDetector(new Uint8Array([1]).buffer);

    expect(await detector.run('canvas')).toEqual([
      { x: 1, y: 2, width: 3, height: 4, canvas: 'canvas' },
    ]);
    expect(ort.env.wasm).toEqual(
      expect.objectContaining({
        wasmPaths: { wasm: `${appBase}paddle/ort/ort-wasm-simd-threaded.wasm` },
        numThreads: 1,
        proxy: false,
      }),
    );
    expect(ort.InferenceSession.create).toHaveBeenCalledWith(new Uint8Array([1]), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  });

  it('reads every box on its own, keeping even the unsure readings', async () => {
    const dependencies = browserPaddleDependencies(appBase);

    const recognizer = await dependencies.createRecognizer(new Uint8Array([2]).buffer, ['a']);
    const box = { x: 0, y: 0, width: 5, height: 5 };

    expect(await recognizer.run('canvas', [box])).toEqual([
      'canvas',
      [box],
      ['a'],
      'per-box',
      { minimumConfidence: 0 },
    ]);
    expect(paddle.RecognitionService).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        charactersDictionary: ['a'],
        minimumConfidence: 0,
        strategy: 'per-box',
      }),
    );
  });

  it('draws the photo on a canvas of its size, released once read', async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 30, height: 20, close })),
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      vi.fn(function (this: object, width: number, height: number) {
        Object.assign(this, { width, height, getContext: () => ({ drawImage }) });
      }),
    );

    const photo = await browserPaddleDependencies(appBase).decode(new Blob(['photo']));

    expect(photo.size).toEqual({ width: 30, height: 20 });
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(() => {
      photo.close();
    }).not.toThrow();
  });
});
