import type { BackupFile } from '../backup/backupService';

/** A text file to hand over: a pack or a backup. */
export type SharedFile = BackupFile;

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** The Web Share API (absent on most computers) and the download, injected for the tests. */
export interface ShareEnvironment {
  canShare: ((data: ShareData) => boolean) | undefined;
  share: ((data: ShareData) => Promise<void>) | undefined;
  download: (file: SharedFile) => void;
}

/**
 * Opens the share sheet of the device with the file (messaging, school platform...), or
 * downloads it where the browser cannot share files. Must run from a click: the share sheet
 * needs a user gesture.
 */
export async function shareOrDownload(
  file: SharedFile,
  environment: ShareEnvironment,
): Promise<ShareOutcome> {
  const { canShare, share, download } = environment;
  const data: ShareData = {
    files: [new File([file.text], file.fileName, { type: 'application/json' })],
  };
  if (share !== undefined && canShare?.(data) === true) {
    try {
      await share(data);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  download(file);
  return 'downloaded';
}

/** The browser's share sheet, if any; `download` saves the file otherwise. */
export function browserShareEnvironment(download: (file: SharedFile) => void): ShareEnvironment {
  const canShare = typeof navigator.canShare === 'function';
  return {
    canShare: canShare ? (data) => navigator.canShare(data) : undefined,
    share: canShare ? (data) => navigator.share(data) : undefined,
    download,
  };
}
