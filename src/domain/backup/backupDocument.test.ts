import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonicalJson';
import { BACKUP_FORMAT, CURRENT_SCHEMA_VERSION, createBackup } from './backupDocument';
import { card, metadata, sampleData, sha256 } from './backup.fixtures';

describe('createBackup', () => {
  it('describes the file, the app and the profile around the data', async () => {
    const backup = await createBackup(sampleData(), metadata, sha256);

    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: metadata.exportedAt,
      appVersion: '0.3.0',
      profileName: 'Léa',
      data: sampleData(),
    });
    expect(BACKUP_FORMAT).toBe('vocab-learner-backup');
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it('fingerprints the canonical content, everything but the fingerprint itself', async () => {
    const { sha256: fingerprint, ...content } = await createBackup(sampleData(), metadata, sha256);

    expect(fingerprint).toBe(await sha256(canonicalJson(content)));
  });

  it('changes the fingerprint when a single word changes', async () => {
    const edited = sampleData();
    edited.cards[0] = { ...card('c1', '猫', ['animals']), translation: 'chaton' };

    const original = await createBackup(sampleData(), metadata, sha256);
    const changed = await createBackup(edited, metadata, sha256);

    expect(changed.sha256).not.toBe(original.sha256);
  });
});
