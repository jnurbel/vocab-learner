import { describe, expect, it } from 'vitest';
import { createBackup, serializeBackup, type BackupDocument } from './backupDocument';
import { card, emptyData, metadata, sampleData, sha256 } from './backup.fixtures';
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

  describe('content validation', () => {
    const data = (document: Record<string, unknown>) => document['data'] as Record<string, unknown>;
    const member = (value: unknown, key: string | number) =>
      (value as Record<string | number, unknown>)[key] as Record<string, unknown>;
    const firstCard = (document: Record<string, unknown>) => member(data(document)['cards'], 0);

    it('accepts a backup without progress nor settings yet', async () => {
      const backup = await createBackup(emptyData(), metadata, sha256);

      expect(await parseBackup(serializeBackup(backup), sha256)).toEqual({
        ok: true,
        value: backup,
      });
    });

    it('refuses an unknown field, wherever it is', async () => {
      const text = await resealed((document) => {
        firstCard(document)['script'] = 'alert(1)';
      });

      expect(await parseBackup(text, sha256)).toEqual({
        ok: false,
        errors: [{ path: 'data.cards.0', code: 'unrecognized_keys' }],
      });
    });

    it('refuses a __proto__ key and leaves the object prototype untouched', async () => {
      const text = (await backupText()).replace(
        '"term":"猫"',
        '"__proto__":{"polluted":true},"term":"猫"',
      );

      const parsed = await parseBackup(text, sha256);

      expect(parsed).toEqual({
        ok: false,
        errors: [{ path: 'data.cards.0.__proto__', code: 'forbiddenKey' }],
      });
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it.each([
      ['a control character in a word', 'term', `猫${String.fromCodePoint(0x1b)}`, 'custom'],
      [
        'a bidi override in a translation',
        'translation',
        `a${String.fromCodePoint(0x202e)}b`,
        'custom',
      ],
      ['a too long translation', 'translation', 'x'.repeat(301), 'too_big'],
      ['an empty word', 'term', '   ', 'too_small'],
      ['an unknown language', 'language', 'fr', 'invalid_value'],
      ['an identifier with markup', 'id', '<img onerror=x>', 'invalid_format'],
      ['a date that is not ISO', 'createdAt', 'yesterday', 'invalid_format'],
      ['a number instead of a text', 'translation', 42, 'invalid_type'],
    ])('refuses %s', async (_case, field, value, code) => {
      const text = await resealed((document) => {
        firstCard(document)[field] = value;
      });

      expect(await parseBackup(text, sha256)).toEqual({
        ok: false,
        errors: [{ path: `data.cards.0.${field}`, code }],
      });
    });

    it.each([
      ['a label colour that could inject CSS', ['labels', 0, 'color'], 'red;background:url(x)'],
      ['a negative stability', ['reviewStates', 0, 'stability'], -1],
      ['a fractional review count', ['reviewStates', 0, 'reps'], 1.5],
      ['an unknown stage', ['reviewStates', 0, 'peakStage'], 'tree'],
      ['an invalid day', ['reviewStates', 0, 'lastSuccessDay'], '2026-13-45'],
      ['an unknown session outcome', ['sessions', 0, 'results', 0, 'outcome'], 'perfect'],
      ['a negative xp', ['progress', 'xp'], -5],
      ['a volume above 100 %', ['settings', 'sfxVolume'], 1.5],
      ['an unknown path step status', ['pathProgress', 0, 'steps', 'listen'], 'flying'],
      ['a final challenge score above 20', ['pathProgress', 0, 'finalChallengeBest'], 21],
    ])('refuses %s', async (_case, path, value) => {
      const text = await resealed((document) => {
        let target = data(document);
        for (const key of path.slice(0, -1)) {
          target = target[key] as Record<string, unknown>;
        }
        target[path.at(-1) as string] = value;
      });

      const parsed = await parseBackup(text, sha256);

      expect(parsed.ok).toBe(false);
      expect(parsed.ok ? [] : parsed.errors.map((issue) => issue.path)).toEqual([
        `data.${path.join('.')}`,
      ]);
    });

    it('refuses an unknown path step', async () => {
      const text = await resealed((document) => {
        member(data(document)['pathProgress'], 0)['steps'] = { fly: 'current' };
      });

      expect(await parseBackup(text, sha256)).toMatchObject({
        ok: false,
        errors: [{ path: 'data.pathProgress.0.steps' }],
      });
    });

    it('refuses more words than a profile can hold', async () => {
      const text = await resealed((document) => {
        data(document)['cards'] = Array.from({ length: BACKUP_LIMITS.cards + 1 }, (_, index) =>
          card(`c${String(index)}`, `word${String(index)}`, [], 'en'),
        );
      });

      expect(await parseBackup(text, sha256)).toEqual({
        ok: false,
        errors: [{ path: 'data.cards', code: 'too_big' }],
      });
    });

    it('refuses a profile name with control characters', async () => {
      const text = await resealed((document) => {
        document['profileName'] = `Léa${String.fromCodePoint(0x07)}`;
      });

      expect(codes(await parseBackup(text, sha256))).toEqual(['custom']);
    });
  });
});
