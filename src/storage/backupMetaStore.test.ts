// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sampleData } from '../domain/backup/backup.fixtures';
import { BackupMetaStore } from './backupMetaStore';
import { BackupRepository } from './backupRepository';

let databaseCount = 0;
let databaseName: string;
let store: BackupMetaStore<{ name: string }>;

beforeEach(() => {
  databaseCount += 1;
  databaseName = `backup-meta-test-${String(databaseCount)}`;
  store = new BackupMetaStore(databaseName);
});

afterEach(async () => {
  await store.deleteDatabase();
});

describe('BackupMetaStore', () => {
  it('knows neither backup nor change in a new profile', async () => {
    expect(await store.lastBackupAt()).toBeUndefined();
    expect(await store.lastChangeAt()).toBeUndefined();
    expect(await store.directoryHandle()).toBeUndefined();
  });

  it('remembers the time of the last backup and of the last change', async () => {
    await store.recordBackup('2026-11-01T10:00:00.000Z');
    await store.recordChange('2026-11-03T10:00:00.000Z');

    expect(await store.lastBackupAt()).toBe('2026-11-01T10:00:00.000Z');
    expect(await store.lastChangeAt()).toBe('2026-11-03T10:00:00.000Z');
  });

  it('remembers the chosen backup folder until it is forgotten', async () => {
    await store.saveDirectoryHandle({ name: 'Backups' });

    expect(await store.directoryHandle()).toEqual({ name: 'Backups' });

    await store.forgetDirectoryHandle();
    expect(await store.directoryHandle()).toBeUndefined();
  });

  it('keeps this bookkeeping when the profile is replaced by a restore', async () => {
    await store.recordBackup('2026-11-01T10:00:00.000Z');

    await new BackupRepository(databaseName).replaceAll(sampleData());

    expect(await store.lastBackupAt()).toBe('2026-11-01T10:00:00.000Z');
  });
});
