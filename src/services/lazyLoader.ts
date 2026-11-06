/**
 * Defers a costly load (a dynamic import) until it is first needed, then shares it.
 * A failed load is forgotten so that the next call tries again (e.g. back online).
 */
export function lazyLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
