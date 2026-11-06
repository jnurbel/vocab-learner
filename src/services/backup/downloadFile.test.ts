import { describe, expect, it, vi } from 'vitest';
import { browserDownloadEnvironment, downloadFile, type DownloadEnvironment } from './downloadFile';

function fakeEnvironment() {
  const blobs: Blob[] = [];
  const scheduled: (() => void)[] = [];
  const revokeObjectURL = vi.fn();
  const environment: DownloadEnvironment = {
    document,
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:backup-1';
    }),
    revokeObjectURL,
    later: (task) => scheduled.push(task),
  };
  return { environment, blobs, scheduled, revokeObjectURL };
}

describe('downloadFile', () => {
  it('downloads the backup as a JSON file under its name, through a temporary link', async () => {
    const { environment, blobs } = fakeEnvironment();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    downloadFile(
      { fileName: 'vocab-learner-Léa-2026-11-05.vocab-backup.json', text: '{"a":1}' },
      environment,
    );

    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe('vocab-learner-Léa-2026-11-05.vocab-backup.json');
    expect(clicked[0]?.getAttribute('href')).toBe('blob:backup-1');
    expect(blobs[0]?.type).toBe('application/json');
    expect(await blobs[0]?.text()).toBe('{"a":1}');
    expect(document.querySelector('a')).toBeNull();
  });

  it('releases the file from memory once the browser has taken it', () => {
    const { environment, scheduled, revokeObjectURL } = fakeEnvironment();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadFile({ fileName: 'backup.json', text: '{}' }, environment);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    scheduled.forEach((task) => {
      task();
    });

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup-1');
  });

  it('uses the browser object URLs and releases them a moment later', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:real');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadFile({ fileName: 'backup.json', text: '{}' }, browserDownloadEnvironment());
    vi.advanceTimersByTime(1_000);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:real');
    vi.useRealTimers();
  });
});
