import { describe, expect, it, vi } from 'vitest';

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));

const { createPhotoReader, loadTextRecognizer, tesseractAssetUrls } = await import('./ocrLoader');

describe('tesseractAssetUrls', () => {
  it('points at the files served by the app under its base path, never at a CDN', () => {
    expect(tesseractAssetUrls('http://localhost:4173/vocab-learner/')).toEqual({
      workerPath: 'http://localhost:4173/vocab-learner/tesseract/worker.min.js',
      corePath: 'http://localhost:4173/vocab-learner/tesseract/core',
      langPath: 'http://localhost:4173/vocab-learner/tesseract/lang',
    });
  });
});

describe('loadTextRecognizer', () => {
  it('loads the text recognizer on demand, once', async () => {
    const recognizer = await loadTextRecognizer();

    expect(recognizer).toHaveProperty('recognize');
    expect(await loadTextRecognizer()).toBe(recognizer);
  });
});

describe('createPhotoReader', () => {
  it('starts the photo reader worker, a module of the app, only when a photo is read', async () => {
    const started: { url: string; options: WorkerOptions | undefined }[] = [];
    vi.stubGlobal(
      'Worker',
      vi.fn(function (this: object, url: URL, options?: WorkerOptions) {
        started.push({ url: url.href, options });
        Object.assign(this, {
          postMessage: vi.fn(),
          addEventListener: vi.fn(),
          terminate: vi.fn(),
        });
      }),
    );
    const reader = createPhotoReader();
    expect(started).toEqual([]);

    const reading = reader.correctFrench(['pomme'], {
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });

    expect(started).toEqual([
      {
        url: expect.stringMatching(/\/paddle\.worker\.ts\b/) as string,
        options: { type: 'module', name: 'photo-reader' },
      },
    ]);
    reader.dispose();
    vi.unstubAllGlobals();
    await expect(reading).rejects.toThrow('cancelled');
  });
});
