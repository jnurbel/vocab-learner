// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { card, emptyData, sampleData, sha256 } from '../../domain/backup/backup.fixtures';
import { BACKUP_LIMITS } from '../../domain/backup/backupSchema';
import { BackupRepository } from '../../storage/backupRepository';
import { BackupService, type ReadableFile } from './backupService';

const moment = new Date(2026, 10, 5, 18, 30);

let databaseCount = 0;
let repository: BackupRepository;
let service: BackupService;

function textFile(text: string): ReadableFile {
  return { size: new TextEncoder().encode(text).length, text: () => Promise.resolve(text) };
}

beforeEach(() => {
  databaseCount += 1;
  repository = new BackupRepository(`backup-service-test-${String(databaseCount)}`);
  let ids = 0;
  service = new BackupService({
    repository,
    sha256,
    clock: () => moment,
    newId: () => {
      ids += 1;
      return `new-${String(ids)}`;
    },
    appVersion: '0.3.0',
    profileName: 'Léa',
  });
});

afterEach(async () => {
  await repository.deleteDatabase();
});

describe('BackupService', () => {
  it('produces the backup file of the whole profile, named after the pseudonym and the day', async () => {
    await repository.replaceAll(sampleData());

    const file = await service.createBackupFile();

    expect(file.fileName).toBe('vocab-learner-Léa-2026-11-05.vocab-backup.json');
    expect(JSON.parse(file.text)).toMatchObject({
      format: 'vocab-learner-backup',
      exportedAt: moment.toISOString(),
      appVersion: '0.3.0',
      profileName: 'Léa',
      data: sampleData(),
    });
  });

  it('reads a backup file and summarizes it for the preview', async () => {
    await repository.replaceAll(sampleData());
    const file = await service.createBackupFile();

    const read = await service.readBackupFile(textFile(file.text));

    expect(read.ok && read.value.summary).toMatchObject({
      wordCount: 2,
      labelCount: 1,
      level: 2,
      streakDays: 3,
    });
  });

  it('passes on the reasons why a file is not a valid backup', async () => {
    expect(await service.readBackupFile(textFile('{"format":"something else"}'))).toEqual({
      ok: false,
      errors: [{ path: '', code: 'notABackup' }],
    });
  });

  it('refuses a file over 20 MB without reading its content', async () => {
    const huge: ReadableFile = {
      size: BACKUP_LIMITS.characters + 1,
      text: () => Promise.reject(new Error('must not be read')),
    };

    expect(await service.readBackupFile(huge)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'fileTooLarge' }],
    });
  });

  it('reports a file that cannot be read instead of throwing', async () => {
    const unreadable: ReadableFile = {
      size: 10,
      text: () => Promise.reject(new Error('NotReadableError')),
    };

    expect(await service.readBackupFile(unreadable)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'unreadableFile' }],
    });
  });

  it('replaces the profile and first hands back a backup of what was there', async () => {
    const current = { ...emptyData(), cards: [card('old', '旧')] };
    await repository.replaceAll(current);
    const incoming = await backupOf(sampleData());

    const outcome = await service.restore(incoming, 'replace');

    expect(await repository.snapshot()).toEqual(sampleData());
    expect(outcome.safetyBackup?.fileName).toBe('vocab-learner-Léa-2026-11-05.vocab-backup.json');
    expect(JSON.parse(outcome.safetyBackup?.text ?? '{}')).toMatchObject({ data: current });
  });

  it('merges a backup into the profile, without safety backup since nothing is lost', async () => {
    await repository.replaceAll({ ...emptyData(), cards: [card('own', '狗')] });

    const outcome = await service.restore(await backupOf(sampleData()), 'merge');

    const terms = (await repository.snapshot()).cards.map(({ term }) => term);
    expect(terms.sort()).toEqual(['apple', '狗', '猫'].sort());
    expect(outcome).toEqual({});
  });
});

async function backupOf(data: ReturnType<typeof sampleData>) {
  const source = new BackupRepository(`backup-service-source-${String(databaseCount)}`);
  await source.replaceAll(data);
  const file = await new BackupService({
    repository: source,
    sha256,
    clock: () => moment,
    newId: () => 'unused',
    appVersion: '0.3.0',
    profileName: 'Tom',
  }).createBackupFile();
  await source.deleteDatabase();
  const read = await service.readBackupFile(textFile(file.text));
  if (!read.ok) {
    throw new Error('The test backup should be valid');
  }
  return read.value.backup;
}
