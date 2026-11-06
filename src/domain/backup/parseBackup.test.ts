import { describe, expect, it } from 'vitest';
import { createBackup, serializeBackup, type BackupDocument } from './backupDocument';
import { card, metadata, sampleData, sha256 } from './backup.fixtures';
import { BACKUP_LIMITS } from './backupSchema';
import { canonicalJson } from './canonicalJson';
import { parseBackup } from './parseBackup';

async function backupText(edit: (document: Record<string, unknown>) => void = () => undefined) {
  const document = (await createBackup(sampleData(), metadata, sha256)) as unknown as Record<
    string,
    unknown
  >;
  edit(document);
  return JSON.stringify(document);
}

/** Re-fingerprints an edited document, as a hostile but careful author would. */
async function resealed(edit: (document: Record<string, unknown>) => void) {
  const backup = (await createBackup(sampleData(), metadata, sha256)) as unknown as Record<
    string,
    unknown
  >;
  edit(backup);
  delete backup['sha256'];
  backup['sha256'] = await sha256(canonicalJson(backup));
  return JSON.stringify(backup);
}

const codes = (result: { ok: boolean; errors?: { code: string }[] }) =>
  result.ok ? [] : (result.errors ?? []).map(({ code }) => code);

describe('parseBackup', () => {
  it('reads back exactly the backup the app wrote', async () => {
    const backup = await createBackup(sampleData(), metadata, sha256);

    const parsed = await parseBackup(serializeBackup(backup), sha256);

    expect(parsed).toEqual({ ok: true, value: backup });
  });

  it.each([
    ['not JSON at all', 'hello'],
    ['an empty file', ''],
  ])('rejects %s as invalid JSON, without throwing', async (_case, text) => {
    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'invalidJson' }],
    });
  });

  it('rejects a truncated backup', async () => {
    const text = serializeBackup(await createBackup(sampleData(), metadata, sha256));

    const parsed = await parseBackup(text.slice(0, text.length / 2), sha256);

    expect(parsed).toEqual({ ok: false, errors: [{ path: '', code: 'invalidJson' }] });
  });

  it('rejects a deeply nested file before parsing it', async () => {
    const depth = 100_000;
    const text = `${'['.repeat(depth)}${']'.repeat(depth)}`;

    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'tooDeep' }],
    });
  });

  it('does not count brackets inside texts as nesting', async () => {
    const backup = await createBackup(
      {
        ...sampleData(),
        cards: [{ ...card('c1', '猫', ['animals']), example: `${'[{'.repeat(50)} "\\` }],
      },
      metadata,
      sha256,
    );

    expect((await parseBackup(serializeBackup(backup), sha256)).ok).toBe(true);
  });

  it('rejects a file larger than 20 MB without reading it', async () => {
    expect(BACKUP_LIMITS.characters).toBe(20 * 1024 * 1024);
    const text = ' '.repeat(BACKUP_LIMITS.characters + 1);

    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'fileTooLarge' }],
    });
  });

  it.each([
    ['a vocabulary pack', { format: 'vocab-learner-pack', version: 1, labels: [], cards: [] }],
    ['a JSON list', []],
    ['a JSON number', 42],
    ['an object without schema version', { format: 'vocab-learner-backup' }],
  ])('rejects %s as not being a backup', async (_case, content) => {
    expect(await parseBackup(JSON.stringify(content), sha256)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'notABackup' }],
    });
  });

  it('refuses a backup written by a newer app, telling which version it needs', async () => {
    const text = await resealed((document) => {
      document['schemaVersion'] = 2;
    });

    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: 'schemaVersion', code: 'newerVersion', version: 2 }],
    });
  });

  it('detects a damaged file through its fingerprint', async () => {
    const text = await backupText((document) => {
      const data = document['data'] as BackupDocument['data'];
      data.cards = [{ ...card('c1', '猫', ['animals']), translation: 'tampered' }];
    });

    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: 'sha256', code: 'fingerprintMismatch' }],
    });
  });

  it('rejects a backup without fingerprint', async () => {
    const text = await backupText((document) => {
      delete document['sha256'];
    });

    expect(codes(await parseBackup(text, sha256))).toEqual(['fingerprintMismatch']);
  });
});
