import { describe, expect, it, vi } from 'vitest';

import { createPhotoReader } from './ocrLoader';

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
