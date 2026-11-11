import { createHash } from 'node:crypto';
import type { Deps, Env } from '../src/handler.ts';
import type { QuotaStore } from '../src/quota.ts';

export const ALLOWED_ORIGIN = 'https://jnurbel.github.io';
export const WORKER_URL = 'https://vocab-learner-photo.example.workers.dev';
export const ACCESS_CODE = 'jade-garden-42';

export function sha256Hex(text: string): Promise<string> {
  return Promise.resolve(createHash('sha256').update(text, 'utf8').digest('hex'));
}

export const ACCESS_CODE_HASH: string = createHash('sha256')
  .update(ACCESS_CODE, 'utf8')
  .digest('hex');

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ALLOWED_ORIGINS: `${ALLOWED_ORIGIN}, http://localhost:5173`,
    ACCESS_CODE_HASHES: `${'f'.repeat(64)},${ACCESS_CODE_HASH}`,
    ...overrides,
  };
}

/** In-memory stand-in for the QUOTA KV namespace, recording what is written. */
export class MemoryQuotaStore implements QuotaStore {
  readonly values = new Map<string, string>();
  readonly puts: { key: string; value: string; expirationTtl: number }[] = [];

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  put(key: string, value: string, options: { expirationTtl: number }): Promise<void> {
    this.values.set(key, value);
    this.puts.push({ key, value, expirationTtl: options.expirationTtl });
    return Promise.resolve();
  }
}

/** 2026-11-11, 22:00 UTC: two hours before the quota resets. */
export const NOW = new Date('2026-11-11T22:00:00Z');
export const TODAY_KEY = `${ACCESS_CODE_HASH}:2026-11-11`;

export function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    quota: new MemoryQuotaStore(),
    now: () => NOW,
    ...overrides,
  };
}

export function photoRequest(
  init: {
    origin?: string | null;
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Request {
  const headers = new Headers(init.headers);
  const origin = init.origin === undefined ? ALLOWED_ORIGIN : init.origin;
  if (origin !== null) headers.set('Origin', origin);
  const method = init.method ?? 'POST';
  return new Request(`${WORKER_URL}${init.path ?? '/v1/photo'}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : init.body,
  });
}
