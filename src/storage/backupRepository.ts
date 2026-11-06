import type { BackupData } from '../domain/backup/backupDocument';
import { mergeBackupData } from '../domain/backup/mergeBackupData';
import { SINGLETON_KEY, toCard, toStored, VocabularyDatabase } from './database';

/** Reads and writes a whole profile at once, for backups and restores. */
export class BackupRepository {
  private readonly db: VocabularyDatabase;

  constructor(databaseName: string) {
    this.db = new VocabularyDatabase(databaseName);
  }

  private get dataTables() {
    const {
      cards,
      labels,
      ignoredTerms,
      reviewStates,
      sessions,
      progress,
      settings,
      pathProgress,
    } = this.db;
    return [cards, labels, ignoredTerms, reviewStates, sessions, progress, settings, pathProgress];
  }

  /** Everything the profile owns, read consistently. */
  async snapshot(): Promise<BackupData> {
    return this.db.transaction('r', this.dataTables, () => this.readAll());
  }

  /** Replaces the whole profile, atomically: on any failure, nothing changes. */
  async replaceAll(data: BackupData): Promise<void> {
    await this.db.transaction('rw', this.dataTables, () => this.writeAll(data));
  }

  /** Merges a backup into the profile (see mergeBackupData), atomically. */
  async mergeWith(incoming: BackupData, newId: () => string): Promise<void> {
    await this.db.transaction('rw', this.dataTables, async () => {
      const local = await this.readAll();
      await this.writeAll(mergeBackupData(local, incoming, newId));
    });
  }

  async deleteDatabase(): Promise<void> {
    await this.db.delete();
  }

  private async readAll(): Promise<BackupData> {
    const db = this.db;
    const [cards, labels, ignoredTerms, reviewStates, sessions, progress, settings, pathProgress] =
      await Promise.all([
        db.cards.toArray(),
        db.labels.toArray(),
        db.ignoredTerms.toArray(),
        db.reviewStates.toArray(),
        db.sessions.toArray(),
        db.progress.get(SINGLETON_KEY),
        db.settings.get(SINGLETON_KEY),
        db.pathProgress.toArray(),
      ]);
    return {
      cards: cards.map(toCard),
      labels,
      ignoredTerms,
      reviewStates,
      sessions,
      ...(progress === undefined ? {} : { progress }),
      ...(settings === undefined ? {} : { settings }),
      pathProgress,
    };
  }

  /** Must run inside a read-write transaction on every data table. */
  private async writeAll(data: BackupData): Promise<void> {
    const db = this.db;
    await Promise.all(this.dataTables.map((table) => table.clear()));
    await Promise.all([
      db.cards.bulkAdd(data.cards.map(toStored)),
      db.labels.bulkAdd(data.labels),
      db.ignoredTerms.bulkAdd(data.ignoredTerms),
      db.reviewStates.bulkAdd(data.reviewStates),
      db.sessions.bulkAdd(data.sessions),
      db.pathProgress.bulkAdd(data.pathProgress),
      data.progress === undefined ? undefined : db.progress.put(data.progress, SINGLETON_KEY),
      data.settings === undefined ? undefined : db.settings.put(data.settings, SINGLETON_KEY),
    ]);
  }
}
