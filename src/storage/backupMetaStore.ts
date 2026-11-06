import { VocabularyDatabase } from './database';

const LAST_BACKUP_AT = 'lastBackupAt';
const LAST_CHANGE_AT = 'lastChangeAt';
const BACKUP_DIRECTORY = 'backupDirectory';

/**
 * The app's own bookkeeping about backups, kept on this device and never in a backup: when the
 * last backup and the last change happened, and the folder chosen for automatic backups.
 * `Handle` is a FileSystemDirectoryHandle in the browser, which IndexedDB can store.
 */
export class BackupMetaStore<Handle = FileSystemDirectoryHandle> {
  private readonly db: VocabularyDatabase;

  constructor(databaseName: string) {
    this.db = new VocabularyDatabase(databaseName);
  }

  async lastBackupAt(): Promise<string | undefined> {
    return (await this.db.meta.get(LAST_BACKUP_AT)) as string | undefined;
  }

  /** `at`: ISO datetime. */
  async recordBackup(at: string): Promise<void> {
    await this.db.meta.put(at, LAST_BACKUP_AT);
  }

  async lastChangeAt(): Promise<string | undefined> {
    return (await this.db.meta.get(LAST_CHANGE_AT)) as string | undefined;
  }

  /** To call after anything worth backing up changed (a session, an edit...). */
  async recordChange(at: string): Promise<void> {
    await this.db.meta.put(at, LAST_CHANGE_AT);
  }

  async directoryHandle(): Promise<Handle | undefined> {
    return (await this.db.meta.get(BACKUP_DIRECTORY)) as Handle | undefined;
  }

  async saveDirectoryHandle(handle: Handle): Promise<void> {
    await this.db.meta.put(handle, BACKUP_DIRECTORY);
  }

  async forgetDirectoryHandle(): Promise<void> {
    await this.db.meta.delete(BACKUP_DIRECTORY);
  }

  async deleteDatabase(): Promise<void> {
    await this.db.delete();
  }
}
