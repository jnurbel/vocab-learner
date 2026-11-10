import { describe, expect, it, vi } from 'vitest';

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));

const { loadTextRecognizer, tesseractAssetUrls } = await import('./ocrLoader');

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
