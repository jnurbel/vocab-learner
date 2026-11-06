/** The part of the browser StorageManager used here, so that it can be replaced in tests. */
export interface PersistableStorage {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

/**
 * Asks the browser, once, not to evict the words (DESIGN §11, data loss on iOS).
 * Called after each save; the answer does not matter and any failure is silent.
 */
export function persistenceRequester(storage: PersistableStorage | undefined): () => Promise<void> {
  let request: Promise<void> | undefined;
  return () => {
    request ??= ask(storage);
    return request;
  };
}

async function ask(storage: PersistableStorage | undefined): Promise<void> {
  if (storage === undefined) {
    return;
  }
  try {
    if (!(await storage.persisted())) {
      await storage.persist();
    }
  } catch {
    // Persistence is a best effort: the app works the same without it.
  }
}
