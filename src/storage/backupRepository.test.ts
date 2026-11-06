// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  card,
  emptyData,
  label,
  metadata,
  reviewState,
  sampleData,
  sha256,
} from '../domain/backup/backup.fixtures';
import { createBackup, serializeBackup } from '../domain/backup/backupDocument';
import { parseBackup } from '../domain/backup/parseBackup';
import { BackupRepository } from './backupRepository';
import { VocabularyRepository } from './vocabularyRepository';

let databaseCount = 0;
let repositories: BackupRepository[] = [];

function newRepository(): BackupRepository {
  databaseCount += 1;
  const repository = new BackupRepository(`backup-test-${String(databaseCount)}`);
  repositories.push(repository);
  return repository;
}

let repository: BackupRepository;

beforeEach(() => {
  repository = newRepository();
});

afterEach(async () => {
  await Promise.all(repositories.map((each) => each.deleteDatabase()));
  repositories = [];
});

const newIds = () => {
  let count = 0;
  return () => {
    count += 1;
    return `new-${String(count)}`;
  };
};

describe('BackupRepository', () => {
  it('reads an empty profile as empty data', async () => {
    expect(await repository.snapshot()).toStrictEqual(emptyData());
  });

  it('replaces the whole profile and reads it back identically', async () => {
    await repository.replaceAll(sampleData());

    expect(await repository.snapshot()).toEqual(sampleData());
  });

  it('removes what the replacing backup does not contain', async () => {
    await repository.replaceAll(sampleData());

    await repository.replaceAll(emptyData());

    expect(await repository.snapshot()).toStrictEqual(emptyData());
  });

  it('keeps the words usable by the vocabulary screens after a restore', async () => {
    await repository.replaceAll(sampleData());

    const vocabulary = new VocabularyRepository(`backup-test-${String(databaseCount)}`);

    expect(await vocabulary.cardsWithLabels(['animals'])).toEqual([card('c1', '猫', ['animals'])]);
  });

  it('changes nothing when a restore fails halfway', async () => {
    await repository.replaceAll(sampleData());
    const broken = { ...emptyData(), cards: [card('a', 'same'), card('b', 'same')] };

    await expect(repository.replaceAll(broken)).rejects.toThrow();

    expect(await repository.snapshot()).toEqual(sampleData());
  });

  it('merges a backup into the stored profile', async () => {
    await repository.replaceAll({
      ...emptyData(),
      labels: [label('l1', 'Leçon 1')],
      cards: [card('c1', '猫', ['l1'])],
      reviewStates: [
        reviewState('c1', { lastReviewAt: '2026-11-06T08:00:00.000Z', peakStage: 'seed' }),
      ],
    });

    await repository.mergeWith(sampleData(), newIds());

    const merged = await repository.snapshot();
    expect(merged.cards).toEqual([
      card('c1', '猫', ['l1', 'animals']),
      card('c2', 'apple', [], 'en'),
    ]);
    expect(merged.reviewStates).toEqual([
      reviewState('c1', { lastReviewAt: '2026-11-06T08:00:00.000Z', peakStage: 'sprout' }),
    ]);
    expect(merged.progress).toEqual(sampleData().progress);
  });

  it('gives back an identical profile after a backup and a restore elsewhere', async () => {
    await repository.replaceAll(sampleData());
    const text = serializeBackup(await createBackup(await repository.snapshot(), metadata, sha256));

    const parsed = await parseBackup(text, sha256);
    const elsewhere = newRepository();
    if (parsed.ok) {
      await elsewhere.replaceAll(parsed.value.data);
    }

    expect(parsed.ok).toBe(true);
    expect(await elsewhere.snapshot()).toStrictEqual(await repository.snapshot());
  });
});
