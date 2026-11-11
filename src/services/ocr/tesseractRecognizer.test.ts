import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { RecognitionCancelled, type RecognitionProgress } from './textRecognizer';

interface FakeWorker {
  recognize: Mock<() => Promise<{ data: { text: string; confidence: number } }>>;
  terminate: Mock<() => Promise<unknown>>;
}

const tesseract = vi.hoisted(() => ({
  createWorker: vi.fn(),
  logger: undefined as ((message: { status: string; progress: number }) => void) | undefined,
}));

vi.mock('tesseract.js', () => ({ createWorker: tesseract.createWorker }));

const { createTesseractRecognizer } = await import('./tesseractRecognizer');

const assets = {
  workerPath: '/app/tesseract/worker.min.js',
  corePath: '/app/tesseract/core',
  langPath: '/app/tesseract/lang',
};

/** Tesseract gives a mean confidence from 0 to 100; a clear printed text reads above 80. */
function fakeWorker(text: string, confidence = 90): FakeWorker {
  return {
    recognize: vi.fn(() => Promise.resolve({ data: { text, confidence } })),
    terminate: vi.fn(() => Promise.resolve({})),
  };
}

beforeEach(() => {
  tesseract.createWorker.mockReset();
});

function recognizeWith(worker: FakeWorker, signal = new AbortController().signal) {
  tesseract.createWorker.mockImplementation(
    (_langs: unknown, _oem: unknown, options: { logger: typeof tesseract.logger }) => {
      tesseract.logger = options.logger;
      return Promise.resolve(worker);
    },
  );
  const progress: RecognitionProgress[] = [];
  const result = createTesseractRecognizer(assets).recognize(new Blob(['image']), {
    signal,
    onProgress: (step) => progress.push(step),
  });
  return { result, progress };
}

describe('createTesseractRecognizer', () => {
  it('reads Chinese and English with the files served by the app itself, never a CDN', async () => {
    const { result } = recognizeWith(fakeWorker('你好'));
    await result;

    expect(tesseract.createWorker).toHaveBeenCalledWith(
      ['chi_sim', 'eng'],
      1,
      expect.objectContaining({ ...assets, workerBlobURL: false, gzip: true }),
    );
  });

  it('returns the text read, without the spaces put between Chinese characters', async () => {
    const { result } = recognizeWith(fakeWorker('你 好 | bonjour\n'));

    expect(await result).toBe('你好 | bonjour');
  });

  it('returns nothing from a reading too unsure, as handwriting or a table gives', async () => {
    const { result } = recognizeWith(fakeWorker('国 帮 EEC CLIIE 二 了', 14));

    expect(await result).toBe('');
  });

  it('keeps a reading just sure enough', async () => {
    const { result } = recognizeWith(fakeWorker('控制', 40));

    expect(await result).toBe('控制');
  });

  it('frees the reader once the text is read', async () => {
    const worker = fakeWorker('text');
    const { result } = recognizeWith(worker);
    await result;

    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('reports loading, then reading', async () => {
    const worker = fakeWorker('text');
    worker.recognize.mockImplementation(() => {
      tesseract.logger?.({ status: 'recognizing text', progress: 0.5 });
      return Promise.resolve({ data: { text: 'text', confidence: 90 } });
    });
    const { result, progress } = recognizeWith(worker);
    tesseract.logger?.({ status: 'loading language traineddata', progress: 0.25 });
    await result;

    expect(progress).toEqual([
      { step: 'loading', progress: 0.25 },
      { step: 'reading', progress: 0.5 },
    ]);
  });

  it('stops reading and frees the reader when cancelled', async () => {
    const worker = fakeWorker('text');
    worker.recognize.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const { result } = recognizeWith(worker, controller.signal);
    await vi.waitFor(() => {
      expect(worker.recognize).toHaveBeenCalled();
    });

    controller.abort();

    await expect(result).rejects.toBeInstanceOf(RecognitionCancelled);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('stops at once when cancelled while the reader is loading, and frees it once loaded', async () => {
    const worker = fakeWorker('text');
    let finishLoading: (loaded: FakeWorker) => void = () => undefined;
    tesseract.createWorker.mockImplementation(
      () =>
        new Promise<FakeWorker>((resolve) => {
          finishLoading = resolve;
        }),
    );
    const controller = new AbortController();
    const result = createTesseractRecognizer(assets).recognize(new Blob(['image']), {
      signal: controller.signal,
      onProgress: () => undefined,
    });

    controller.abort();

    await expect(result).rejects.toBeInstanceOf(RecognitionCancelled);
    finishLoading(worker);
    await vi.waitFor(() => {
      expect(worker.terminate).toHaveBeenCalledOnce();
    });
    expect(worker.recognize).not.toHaveBeenCalled();
  });

  it('does not start when cancelled before the reader is ready', async () => {
    const controller = new AbortController();
    controller.abort();
    const worker = fakeWorker('text');

    await expect(recognizeWith(worker, controller.signal).result).rejects.toBeInstanceOf(
      RecognitionCancelled,
    );
    expect(worker.recognize).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(worker.terminate).toHaveBeenCalledOnce();
    });
  });

  it('reports a reader that cannot be loaded, e.g. offline before its first use', async () => {
    tesseract.createWorker.mockRejectedValue(new Error('network'));

    await expect(
      createTesseractRecognizer(assets).recognize(new Blob(['image']), {
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow('network');
  });
});
