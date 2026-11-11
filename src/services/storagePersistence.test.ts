import { describe, expect, it, vi } from 'vitest';
import {
  askPersistenceAgain,
  persistenceRequester,
  type PersistableStorage,
} from './storagePersistence';

function fakeStorage(overrides: Partial<PersistableStorage> = {}) {
  return {
    persisted: vi.fn(() => Promise.resolve(false)),
    persist: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  };
}

describe('persistenceRequester', () => {
  it('asks the browser to keep the data at the first save', async () => {
    const storage = fakeStorage();
    const requestPersistence = persistenceRequester(storage);

    await requestPersistence();

    expect(storage.persist).toHaveBeenCalledTimes(1);
  });

  it('asks only once, whatever the number of saves', async () => {
    const storage = fakeStorage();
    const requestPersistence = persistenceRequester(storage);

    await Promise.all([requestPersistence(), requestPersistence()]);
    await requestPersistence();

    expect(storage.persist).toHaveBeenCalledTimes(1);
  });

  it('does not ask again when the storage is already persistent', async () => {
    const storage = fakeStorage({ persisted: vi.fn(() => Promise.resolve(true)) });

    await persistenceRequester(storage)();

    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('fails silently when the browser refuses or throws', async () => {
    const storage = fakeStorage({ persist: vi.fn(() => Promise.reject(new Error('denied'))) });

    await expect(persistenceRequester(storage)()).resolves.toBeUndefined();
  });

  it('does nothing when the browser has no storage manager', async () => {
    await expect(persistenceRequester(undefined)()).resolves.toBeUndefined();
  });
});

describe('askPersistenceAgain', () => {
  it('asks again once installed, even after an earlier request', async () => {
    const storage = fakeStorage();
    await persistenceRequester(storage)();

    await askPersistenceAgain(storage);

    expect(storage.persist).toHaveBeenCalledTimes(2);
  });
});
