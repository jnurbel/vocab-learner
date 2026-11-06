import { describe, expect, it } from 'vitest';
import { createBackup, serializeBackup } from './backupDocument';
import { metadata, sampleData, sha256 } from './backup.fixtures';
import { canonicalJson } from './canonicalJson';
import type { BackupMigrations } from './backupMigrations';
import { parseBackup } from './parseBackup';

/** Pretends that the app is at schema version 3 and the file at version 1. */
const migrations: BackupMigrations = {
  1: (document) => ({ ...document, profileName: `${String(document['profileName'])}-2` }),
  2: (document) => ({ ...document, profileName: `${String(document['profileName'])}-3` }),
};

async function version1Text() {
  return serializeBackup(await createBackup(sampleData(), metadata, sha256));
}

describe('backup migrations', () => {
  it('upgrades an older backup through every migration, in order', async () => {
    const parsed = await parseBackup(await version1Text(), sha256, {
      currentVersion: 3,
      migrations,
    });

    expect(parsed.ok && parsed.value).toMatchObject({ schemaVersion: 3, profileName: 'Léa-2-3' });
  });

  it('checks the fingerprint of the file as it was written, before migrating it', async () => {
    const text = (await version1Text()).replace('"profileName": "Léa"', '"profileName": "Eve"');

    const parsed = await parseBackup(text, sha256, { currentVersion: 3, migrations });

    expect(parsed).toEqual({
      ok: false,
      errors: [{ path: 'sha256', code: 'fingerprintMismatch' }],
    });
  });

  it('refuses an older backup that no migration can upgrade', async () => {
    const parsed = await parseBackup(await version1Text(), sha256, {
      currentVersion: 3,
      migrations: { 1: migrations[1] },
    });

    expect(parsed).toEqual({
      ok: false,
      errors: [{ path: 'schemaVersion', code: 'unsupportedVersion', version: 1 }],
    });
  });

  it('reports a failing migration instead of throwing', async () => {
    const parsed = await parseBackup(await version1Text(), sha256, {
      currentVersion: 2,
      migrations: {
        1: () => {
          throw new Error('broken migration');
        },
      },
    });

    expect(parsed).toEqual({
      ok: false,
      errors: [{ path: 'schemaVersion', code: 'migrationFailed', version: 1 }],
    });
  });

  it('refuses a version 0 backup, which never existed', async () => {
    const content: Record<string, unknown> = {
      ...(await createBackup(sampleData(), metadata, sha256)),
      schemaVersion: 0,
    };
    delete content['sha256'];
    const text = JSON.stringify({ ...content, sha256: await sha256(canonicalJson(content)) });

    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: 'schemaVersion', code: 'unsupportedVersion', version: 0 }],
    });
  });
});
