/** Outcome of an operation on untrusted input: never throws, reports every problem found. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E[] };

export function success<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function failure<E>(errors: E[]): { ok: false; errors: E[] } {
  return { ok: false, errors };
}
