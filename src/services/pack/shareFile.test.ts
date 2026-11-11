import { describe, expect, it, vi } from 'vitest';
import { browserShareEnvironment, shareOrDownload, type ShareEnvironment } from './shareFile';

const file = { fileName: 'Leçon-7.vocab.json', text: '{"format":"vocab-learner-pack"}' };

function environment(overrides: Partial<ShareEnvironment> = {}): ShareEnvironment {
  return {
    canShare: vi.fn(() => true),
    share: vi.fn(() => Promise.resolve()),
    download: vi.fn(),
    ...overrides,
  };
}

describe('shareOrDownload', () => {
  it('shares the pack as a JSON file through the share sheet when the device can', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
    const env = environment({ share });

    await expect(shareOrDownload(file, env)).resolves.toBe('shared');

    const shared = share.mock.calls[0]?.[0];
    const sharedFile = shared?.files?.[0];
    expect(sharedFile?.name).toBe('Leçon-7.vocab.json');
    expect(sharedFile?.type).toBe('application/json');
    expect(await sharedFile?.text()).toBe(file.text);
    expect(env.download).not.toHaveBeenCalled();
  });

  it('downloads the file where the browser has no share sheet', async () => {
    const env = environment({ canShare: undefined, share: undefined });

    await expect(shareOrDownload(file, env)).resolves.toBe('downloaded');

    expect(env.download).toHaveBeenCalledWith(file);
  });

  it('downloads the file where the share sheet takes no file', async () => {
    const env = environment({ canShare: vi.fn(() => false) });

    await expect(shareOrDownload(file, env)).resolves.toBe('downloaded');

    expect(env.share).not.toHaveBeenCalled();
    expect(env.download).toHaveBeenCalledWith(file);
  });

  it('does nothing more when the learner closes the share sheet', async () => {
    const env = environment({
      share: vi.fn(() => Promise.reject(new DOMException('Share canceled', 'AbortError'))),
    });

    await expect(shareOrDownload(file, env)).resolves.toBe('cancelled');

    expect(env.download).not.toHaveBeenCalled();
  });

  it('falls back to a download when the share sheet fails', async () => {
    const env = environment({
      share: vi.fn(() => Promise.reject(new DOMException('No gesture', 'NotAllowedError'))),
    });

    await expect(shareOrDownload(file, env)).resolves.toBe('downloaded');

    expect(env.download).toHaveBeenCalledWith(file);
  });
});

describe('browserShareEnvironment', () => {
  it('offers no share sheet where the browser has none', () => {
    const download = vi.fn();

    const env = browserShareEnvironment(download);

    expect(env.canShare).toBeUndefined();
    expect(env.share).toBeUndefined();
    expect(env.download).toBe(download);
  });

  it("uses the browser's share sheet where there is one", async () => {
    const canShare = vi.fn(() => true);
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { canShare, share });
    try {
      const env = browserShareEnvironment(vi.fn());

      await expect(shareOrDownload(file, env)).resolves.toBe('shared');

      expect(canShare).toHaveBeenCalledOnce();
      expect(share).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
