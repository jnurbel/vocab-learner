import type { BackupFile } from './backupService';

/** Browser APIs used to download, injected so that tests can observe them. */
export interface DownloadEnvironment {
  document: Document;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  /** Runs a task once the browser has had time to start the download. */
  later(task: () => void): void;
}

export const browserDownloadEnvironment = (): DownloadEnvironment => ({
  document,
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => {
    URL.revokeObjectURL(url);
  },
  later: (task) => setTimeout(task, 1_000),
});

/** Saves a file on this device through the browser's download; nothing is sent anywhere. */
export function downloadFile(
  file: BackupFile,
  environment: DownloadEnvironment,
  type = 'application/json',
): void {
  const url = environment.createObjectURL(new Blob([file.text], { type }));
  const link = environment.document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.hidden = true;
  environment.document.body.append(link);
  link.click();
  link.remove();
  // Revoking right away may cancel the download in some browsers.
  environment.later(() => {
    environment.revokeObjectURL(url);
  });
}
