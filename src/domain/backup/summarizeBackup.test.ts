import { describe, expect, it } from 'vitest';
import { createBackup } from './backupDocument';
import { card, emptyData, metadata, sampleData, sha256 } from './backup.fixtures';
import { summarizeBackup } from './summarizeBackup';

describe('summarizeBackup', () => {
  it('counts the words per language and the labels, with level, streak and date', async () => {
    const data = sampleData();
    data.cards.push(card('c3', '狗'));

    expect(summarizeBackup(await createBackup(data, metadata, sha256))).toEqual({
      profileName: 'Léa',
      exportedAt: metadata.exportedAt,
      appVersion: '0.3.0',
      wordCount: 3,
      wordsByLanguage: { zh: 2, en: 1 },
      labelCount: 1,
      level: 2,
      streakDays: 3,
    });
  });

  it('leaves level and streak out when the backup has no progress yet', async () => {
    const summary = summarizeBackup(await createBackup(emptyData(), metadata, sha256));

    expect(summary).toEqual({
      profileName: 'Léa',
      exportedAt: metadata.exportedAt,
      appVersion: '0.3.0',
      wordCount: 0,
      wordsByLanguage: { zh: 0, en: 0 },
      labelCount: 0,
    });
  });
});
