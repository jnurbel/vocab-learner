import {
  createBackup,
  serializeBackup,
  type BackupDocument,
} from '../../domain/backup/backupDocument';
import { backupFileName, localDay } from '../../domain/backup/backupFileName';
import { BACKUP_LIMITS } from '../../domain/backup/backupSchema';
import { parseBackup, type BackupIssue } from '../../domain/backup/parseBackup';
import type { Sha256 } from '../../domain/backup/sha256';
import { summarizeBackup, type BackupSummary } from '../../domain/backup/summarizeBackup';
import { failure, success, type Result } from '../../domain/result';
import type { BackupRepository } from '../../storage/backupRepository';

/** A backup ready to be saved: downloaded, or written to the backup folder. */
export interface BackupFile {
  fileName: string;
  text: string;
}

/** The part of a browser `File` used here. */
export interface ReadableFile {
  /** In bytes. */
  size: number;
  text(): Promise<string>;
}

export type RestoreMode = 'replace' | 'merge';

export interface RestoreOutcome {
  /** Replace mode only: the profile as it was, for the caller to offer for download. */
  safetyBackup?: BackupFile;
}

export interface ReadBackup {
  backup: BackupDocument;
  summary: BackupSummary;
}

export interface BackupServiceDependencies {
  repository: Pick<BackupRepository, 'snapshot' | 'replaceAll' | 'mergeWith'>;
  sha256: Sha256;
  clock: () => Date;
  newId: () => string;
  appVersion: string;
  profileName: string;
}

/** Backs up and restores a profile; everything stays on the device. */
export class BackupService {
  constructor(private readonly deps: BackupServiceDependencies) {}

  async createBackupFile(): Promise<BackupFile> {
    const { repository, sha256, clock, appVersion, profileName } = this.deps;
    const now = clock();
    const backup = await createBackup(
      await repository.snapshot(),
      { exportedAt: now.toISOString(), appVersion, profileName },
      sha256,
    );
    return { fileName: backupFileName(profileName, localDay(now)), text: serializeBackup(backup) };
  }

  /** Validates a chosen file (untrusted) and summarizes it for the preview. Never throws. */
  async readBackupFile(file: ReadableFile): Promise<Result<ReadBackup, BackupIssue>> {
    if (file.size > BACKUP_LIMITS.characters) {
      return failure([{ path: '', code: 'fileTooLarge' }]);
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      return failure([{ path: '', code: 'unreadableFile' }]);
    }
    const parsed = await parseBackup(text, this.deps.sha256);
    return parsed.ok
      ? success({ backup: parsed.value, summary: summarizeBackup(parsed.value) })
      : parsed;
  }

  /**
   * Restores a validated backup atomically. Replace first backs up the current profile and hands
   * that backup back, so that the caller can offer it for download.
   */
  async restore(backup: BackupDocument, mode: RestoreMode): Promise<RestoreOutcome> {
    const { repository, newId } = this.deps;
    if (mode === 'merge') {
      await repository.mergeWith(backup.data, newId);
      return {};
    }
    const safetyBackup = await this.createBackupFile();
    await repository.replaceAll(backup.data);
    return { safetyBackup };
  }
}
