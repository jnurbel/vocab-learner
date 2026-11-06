import type { Card } from '../card';
import type { Label } from '../label';
import type {
  IgnoredTerm,
  PathProgressRecord,
  ProgressRecord,
  ReviewStateRecord,
  SessionRecord,
  SettingsRecord,
} from '../progressRecords';
import { canonicalJson } from './canonicalJson';
import type { Sha256 } from './sha256';

export const BACKUP_FORMAT = 'vocab-learner-backup';
/** Version of the backup layout written by this app; older ones are migrated on restore. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Everything a profile owns (DESIGN §9.1); no photo, audio nor secret. */
export interface BackupData {
  cards: Card[];
  labels: Label[];
  ignoredTerms: IgnoredTerm[];
  reviewStates: ReviewStateRecord[];
  sessions: SessionRecord[];
  progress?: ProgressRecord;
  settings?: SettingsRecord;
  pathProgress: PathProgressRecord[];
}

export interface BackupMetadata {
  /** ISO datetime. */
  exportedAt: string;
  appVersion: string;
  profileName: string;
}

export interface BackupDocument extends BackupMetadata {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  data: BackupData;
  /** SHA-256 of the canonical form of every other field. */
  sha256: string;
}

/** The fingerprint covers the canonical form of the whole document but the fingerprint itself. */
export function fingerprint(content: object, sha256: Sha256): Promise<string> {
  return sha256(canonicalJson(content));
}

export async function createBackup(
  data: BackupData,
  metadata: BackupMetadata,
  sha256: Sha256,
): Promise<BackupDocument> {
  const content = {
    format: BACKUP_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...metadata,
    data,
  } as const;
  return { ...content, sha256: await fingerprint(content, sha256) };
}

/** The text of the backup file: indented, so that a curious parent can read it. */
export function serializeBackup(backup: BackupDocument): string {
  return JSON.stringify(backup, null, 2);
}
