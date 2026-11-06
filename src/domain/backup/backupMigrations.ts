import { failure, success, type Result } from '../result';
import type { BackupIssue } from './parseBackup';

type RawDocument = Record<string, unknown>;

/** Upgrades a document from one schema version to the next; it may throw on bad input. */
export type BackupMigration = (document: RawDocument) => RawDocument;

/** Keyed by the version each migration upgrades from. */
export type BackupMigrations = Readonly<Partial<Record<number, BackupMigration>>>;

/**
 * The migrations of the app. Version 1 is the first layout, so there is none yet: when the layout
 * changes, add `1: (document) => ...` here and raise CURRENT_SCHEMA_VERSION.
 */
export const BACKUP_MIGRATIONS: BackupMigrations = {};

/** Applies the migrations one version at a time, from the file's version to the app's. */
export function migrateBackup(
  document: RawDocument,
  fromVersion: number,
  toVersion: number,
  migrations: BackupMigrations,
): Result<RawDocument, BackupIssue> {
  let migrated = document;
  for (let version = fromVersion; version < toVersion; version += 1) {
    const migration = migrations[version];
    if (migration === undefined) {
      return failure([{ path: 'schemaVersion', code: 'unsupportedVersion', version: fromVersion }]);
    }
    try {
      migrated = { ...migration(migrated), schemaVersion: version + 1 };
    } catch {
      return failure([{ path: 'schemaVersion', code: 'migrationFailed', version: fromVersion }]);
    }
  }
  return success(migrated);
}
