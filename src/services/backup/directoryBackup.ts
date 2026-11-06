import type { BackupFile } from './backupService';

/** How many daily backups of a profile the folder keeps (DESIGN §9.1). */
export const KEPT_BACKUPS = 7;

const READ_WRITE = { mode: 'readwrite' } as const;

/** The parts of the File System Access API used here (Chrome and Edge only). */
export interface WritableFileLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandleLike {
  createWritable(): Promise<WritableFileLike>;
}

export interface DirectoryHandleLike {
  readonly name: string;
  queryPermission(descriptor: typeof READ_WRITE): Promise<PermissionState>;
  requestPermission(descriptor: typeof READ_WRITE): Promise<PermissionState>;
  getFileHandle(name: string, options: { create: true }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  keys(): AsyncIterable<string>;
}

export type DirectoryPicker = () => Promise<DirectoryHandleLike>;

/** Where the chosen folder is remembered (IndexedDB, see BackupMetaStore) and backups recorded. */
export interface DirectoryHandleStore {
  directoryHandle(): Promise<DirectoryHandleLike | undefined>;
  saveDirectoryHandle(handle: DirectoryHandleLike): Promise<void>;
  forgetDirectoryHandle(): Promise<void>;
  recordBackup(at: string): Promise<void>;
}

interface PickerHost {
  showDirectoryPicker?: (options: {
    mode: 'readwrite';
    id: string;
  }) => Promise<DirectoryHandleLike>;
}

/** The folder picker of the browser, if it has one: Firefox and Safari do not. */
export function directoryPickerOf(host: PickerHost): DirectoryPicker | undefined {
  const { showDirectoryPicker } = host;
  return showDirectoryPicker === undefined
    ? undefined
    : () => showDirectoryPicker({ mode: 'readwrite', id: 'vocab-learner-backups' });
}

export type ChooseFolderOutcome = 'chosen' | 'cancelled' | 'unsupported' | 'failed';
/** `permissionNeeded`: the browser revoked the access; `reauthorize` must run on a user gesture. */
export type AutoBackupStatus = 'saved' | 'notConfigured' | 'permissionNeeded' | 'failed';

export interface DirectoryBackupDependencies {
  store: DirectoryHandleStore;
  /** Absent when the browser has no File System Access API. */
  picker?: DirectoryPicker | undefined;
  clock: () => Date;
}

const BACKUP_FILE = /^(vocab-learner-.+)-(\d{4}-\d{2}-\d{2})\.vocab-backup\.json$/;

/** Writes the daily backup into a folder chosen once, keeping the latest few. */
export class DirectoryBackup {
  constructor(private readonly deps: DirectoryBackupDependencies) {}

  isSupported(): boolean {
    return this.deps.picker !== undefined;
  }

  /** Must run on a user gesture (a click), as the browser requires for the picker. */
  async chooseFolder(): Promise<ChooseFolderOutcome> {
    const { picker, store } = this.deps;
    if (picker === undefined) {
      return 'unsupported';
    }
    let handle: DirectoryHandleLike;
    try {
      handle = await picker();
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
    }
    await store.saveDirectoryHandle(handle);
    return 'chosen';
  }

  async folderName(): Promise<string | undefined> {
    return (await this.deps.store.directoryHandle())?.name;
  }

  async forgetFolder(): Promise<void> {
    await this.deps.store.forgetDirectoryHandle();
  }

  /** Asks the access back after the browser revoked it; must run on a user gesture. */
  async reauthorize(): Promise<boolean> {
    const handle = await this.deps.store.directoryHandle();
    return handle !== undefined && (await handle.requestPermission(READ_WRITE)) === 'granted';
  }

  /** Writes the file of the day, then removes the profile's backups beyond the latest 7. */
  async writeBackup(file: BackupFile): Promise<AutoBackupStatus> {
    const { store, clock } = this.deps;
    const handle = await store.directoryHandle();
    if (handle === undefined) {
      return 'notConfigured';
    }
    // Never prompts: a background backup has no user gesture to show a permission request.
    if (!(await hasPermission(handle))) {
      return 'permissionNeeded';
    }
    try {
      const writable = await (
        await handle.getFileHandle(file.fileName, { create: true })
      ).createWritable();
      await writable.write(file.text);
      await writable.close();
    } catch {
      return 'failed';
    }
    await store.recordBackup(clock().toISOString());
    await removeOldBackups(handle, file.fileName);
    return 'saved';
  }
}

async function hasPermission(handle: DirectoryHandleLike): Promise<boolean> {
  try {
    return (await handle.queryPermission(READ_WRITE)) === 'granted';
  } catch {
    // The folder was moved or deleted: choosing it again is the way out.
    return false;
  }
}

/** Only files named like the backups of this profile are candidates; anything else stays. */
async function removeOldBackups(handle: DirectoryHandleLike, currentFileName: string) {
  const profilePrefix = BACKUP_FILE.exec(currentFileName)?.[1];
  const backups: { name: string; day: string }[] = [];
  for await (const name of handle.keys()) {
    const match = BACKUP_FILE.exec(name);
    if (match?.[1] === profilePrefix && match?.[2] !== undefined) {
      backups.push({ name, day: match[2] });
    }
  }
  const outdated = backups
    .sort((left, right) => right.day.localeCompare(left.day))
    .slice(KEPT_BACKUPS);
  await Promise.allSettled(outdated.map(({ name }) => handle.removeEntry(name)));
}
