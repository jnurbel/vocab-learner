// @vitest-environment node
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { VocabularyDatabase } from './database';

const now = '2026-11-05T12:00:00.000Z';

const v1Card = {
  id: 'c1',
  language: 'zh',
  term: '猫',
  translation: 'chat',
  labelIds: ['animals'],
  source: 'manual',
  createdAt: now,
  updatedAt: now,
  termKey: 'zh:猫',
};
const v1Label = { id: 'animals', name: 'Animaux', isFocus: false, createdAt: now, updatedAt: now };

/** Creates the database exactly as version 0.2.0 of the app left it. */
async function createVersion1Database(name: string): Promise<void> {
  const legacy = new Dexie(name);
  legacy.version(1).stores({
    cards: 'id, &termKey, language, *labelIds',
    labels: 'id',
  });
  await legacy.open();
  await legacy.table('cards').add(v1Card);
  await legacy.table('labels').add(v1Label);
  legacy.close();
}

let database: VocabularyDatabase | undefined;

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe('VocabularyDatabase migration to version 2', () => {
  it('keeps every word and label of a version 1 database', async () => {
    await createVersion1Database('migration-keeps-data');

    database = new VocabularyDatabase('migration-keeps-data');
    await database.open();

    expect(database.verno).toBe(2);
    expect(await database.cards.toArray()).toEqual([v1Card]);
    expect(await database.labels.toArray()).toEqual([v1Label]);
    expect(await database.cards.where('labelIds').equals('animals').count()).toBe(1);
  });

  it('adds empty tables for the progress, settings and history', async () => {
    await createVersion1Database('migration-adds-tables');

    database = new VocabularyDatabase('migration-adds-tables');
    await database.open();

    const tableNames = database.tables.map((table) => table.name).sort();
    expect(tableNames).toEqual([
      'cards',
      'ignoredTerms',
      'labels',
      'meta',
      'pathProgress',
      'progress',
      'reviewStates',
      'sessions',
      'settings',
    ]);
    expect(await database.reviewStates.count()).toBe(0);
  });

  it('keys ignored terms by language and term', async () => {
    database = new VocabularyDatabase('ignored-terms-key');

    await database.ignoredTerms.put({ language: 'en', term: 'the' });
    await database.ignoredTerms.put({ language: 'en', term: 'the' });
    await database.ignoredTerms.put({ language: 'zh', term: 'the' });

    expect(await database.ignoredTerms.count()).toBe(2);
  });
});
