import { describe, expect, it, vi } from 'vitest';
import {
  DirectoryBackup,
  directoryPickerOf,
  type DirectoryHandleLike,
  type DirectoryHandleStore,
} from './directoryBackup';

/** An in-memory folder, as the File System Access API exposes it. */
class FakeDirectory implements DirectoryHandleLike {
  readonly files = new Map<string, string>();
  permission: PermissionState = 'granted';
  failWrites = false;
  failRemovals = false;

  constructor(readonly name = 'Backups') {}

  queryPermission = vi.fn(() => Promise.resolve(this.permission));

  requestPermission = vi.fn(() => Promise.resolve(this.permission));

  getFileHandle(name: string) {
    return Promise.resolve({
      createWritable: () => {
        if (this.failWrites) {
          return Promise.reject(new DOMException('Disk full', 'QuotaExceededError'));
        }
        let content = '';
        return Promise.resolve({
          write: (data: string) => {
            content += data;
            return Promise.resolve();
          },
          close: () => {
            this.files.set(name, content);
            return Promise.resolve();
          },
        });
      },
    });
  }

  removeEntry(name: string) {
    if (this.failRemovals) {
      return Promise.reject(new DOMException('Locked', 'NoModificationAllowedError'));
    }
    this.files.delete(name);
    return Promise.resolve();
  }

  async *keys() {
    await Promise.resolve();
    yield* this.files.keys();
  }
}

class MemoryStore implements DirectoryHandleStore {
  handle: DirectoryHandleLike | undefined;
  backups: string[] = [];

  directoryHandle() {
    return Promise.resolve(this.handle);
  }

  saveDirectoryHandle(handle: DirectoryHandleLike) {
    this.handle = handle;
    return Promise.resolve();
  }

  forgetDirectoryHandle() {
    this.handle = undefined;
    return Promise.resolve();
  }

  recordBackup(at: string) {
    this.backups.push(at);
    return Promise.resolve();
  }
}

const moment = new Date('2026-11-05T18:00:00.000Z');
const fileOf = (day: string, pseudo = 'Léa') => ({
  fileName: `vocab-learner-${pseudo}-${day}.vocab-backup.json`,
  text: `{"day":"${day}"}`,
});

function setUp(directory = new FakeDirectory()) {
  const store = new MemoryStore();
  const picker = vi.fn(() => Promise.resolve<DirectoryHandleLike>(directory));
  const backup = new DirectoryBackup({ store, picker, clock: () => moment });
  return { directory, store, picker, backup };
}

describe('directoryPickerOf', () => {
  it('finds the folder picker of Chrome and Edge', async () => {
    const directory = new FakeDirectory();
    const showDirectoryPicker = vi.fn(() => Promise.resolve(directory));

    const picker = directoryPickerOf({ showDirectoryPicker });

    expect(await picker?.()).toBe(directory);
    expect(showDirectoryPicker).toHaveBeenCalledWith({
      mode: 'readwrite',
      id: 'vocab-learner-backups',
    });
  });

  it('finds none in Firefox and Safari, which lack the API', () => {
    expect(directoryPickerOf({})).toBeUndefined();
  });
});

describe('DirectoryBackup', () => {
  it('is unavailable without the folder picker', async () => {
    const backup = new DirectoryBackup({ store: new MemoryStore(), clock: () => moment });

    expect(backup.isSupported()).toBe(false);
    expect(await backup.chooseFolder()).toBe('unsupported');
  });

  it('reports a picker that fails for another reason than a cancellation', async () => {
    const { backup, picker } = setUp();
    picker.mockRejectedValueOnce(new DOMException('No user gesture', 'SecurityError'));

    expect(await backup.chooseFolder()).toBe('failed');
  });

  it('remembers the chosen folder', async () => {
    const { backup, store } = setUp();

    expect(backup.isSupported()).toBe(true);
    expect(await backup.chooseFolder()).toBe('chosen');
    expect(store.handle?.name).toBe('Backups');
    expect(await backup.folderName()).toBe('Backups');
  });

  it('treats a closed picker as a cancellation', async () => {
    const { backup, picker, store } = setUp();
    picker.mockRejectedValueOnce(new DOMException('The user aborted a request.', 'AbortError'));

    expect(await backup.chooseFolder()).toBe('cancelled');
    expect(store.handle).toBeUndefined();
  });

  it('writes the backup of the day in the folder and records the backup time', async () => {
    const { backup, directory, store } = setUp();
    await backup.chooseFolder();

    expect(await backup.writeBackup(fileOf('2026-11-05'))).toBe('saved');

    expect(directory.files.get('vocab-learner-Léa-2026-11-05.vocab-backup.json')).toBe(
      '{"day":"2026-11-05"}',
    );
    expect(store.backups).toEqual([moment.toISOString()]);
  });

  it('keeps only the 7 latest backups of the profile, and never touches other files', async () => {
    const { backup, directory } = setUp();
    await backup.chooseFolder();
    for (let day = 1; day <= 8; day += 1) {
      directory.files.set(fileOf(`2026-10-${String(day).padStart(2, '0')}`).fileName, '{}');
    }
    directory.files.set(fileOf('2026-01-01', 'Tom').fileName, '{}');
    directory.files.set('holiday-photo.jpg', 'jpeg');

    await backup.writeBackup(fileOf('2026-11-05'));

    expect([...directory.files.keys()].sort()).toEqual(
      [
        'holiday-photo.jpg',
        fileOf('2026-01-01', 'Tom').fileName,
        ...['03', '04', '05', '06', '07', '08'].map((day) => fileOf(`2026-10-${day}`).fileName),
        fileOf('2026-11-05').fileName,
      ].sort(),
    );
  });

  it('still reports the backup as saved when an old file cannot be removed', async () => {
    const { backup, directory } = setUp();
    await backup.chooseFolder();
    for (let day = 1; day <= 8; day += 1) {
      directory.files.set(fileOf(`2026-10-0${String(day)}`).fileName, '{}');
    }
    directory.failRemovals = true;

    expect(await backup.writeBackup(fileOf('2026-11-05'))).toBe('saved');
  });

  it('does nothing until a folder is chosen', async () => {
    const { backup, store } = setUp();

    expect(await backup.writeBackup(fileOf('2026-11-05'))).toBe('notConfigured');
    expect(await backup.folderName()).toBeUndefined();
    expect(store.backups).toEqual([]);
  });

  it('asks for permission again, without prompting, when the browser revoked it', async () => {
    const { backup, directory } = setUp();
    await backup.chooseFolder();
    directory.permission = 'prompt';

    expect(await backup.writeBackup(fileOf('2026-11-05'))).toBe('permissionNeeded');
    expect(directory.requestPermission).not.toHaveBeenCalled();
    expect(directory.files.size).toBe(0);
  });

  it('writes again once the user granted the permission back', async () => {
    const { backup, directory } = setUp();
    await backup.chooseFolder();
    directory.permission = 'prompt';
    expect(await backup.reauthorize()).toBe(false);

    directory.permission = 'granted';

    expect(await backup.reauthorize()).toBe(true);
    expect(await backup.writeBackup(fileOf('2026-11-05'))).toBe('saved');
  });

  it('cannot reauthorize without a chosen folder', async () => {
    expect(await setUp().backup.reauthorize()).toBe(false);
  });

  it('reports a failed write instead of throwing, and records no backup', async () => {
    const { backup, directory, store } = setUp();
    await backup.chooseFolder();
    directory.failWrites = true;

    expect(await backup.writeBackup(fileOf('2026-11-05'))).toBe('failed');
    expect(store.backups).toEqual([]);
  });

  it('degrades to a permission request when the stored folder is no longer usable', async () => {
    const { backup, directory } = setUp();
    await backup.chooseFolder();
    directory.queryPermission.mockRejectedValueOnce(new DOMException('Gone', 'NotFoundError'));

    expect(await backup.writeBackup(fileOf('2026-11-05'))).toBe('permissionNeeded');
  });

  it('forgets the folder on request', async () => {
    const { backup, store } = setUp();
    await backup.chooseFolder();

    await backup.forgetFolder();

    expect(store.handle).toBeUndefined();
  });
});
