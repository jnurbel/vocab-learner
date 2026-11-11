import { vi } from 'vitest';
import type { Deps, Env } from '../src/handler.ts';

export const ALLOWED_ORIGIN = 'https://jnurbel.github.io';
export const WORKER_URL = 'https://vocab-learner-photo.example.workers.dev';

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ALLOWED_ORIGINS: `${ALLOWED_ORIGIN}, http://localhost:5173`,
    ...overrides,
  };
}

export function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    ...overrides,
  };
}

export function photoRequest(
  init: { origin?: string | null; method?: string; path?: string; headers?: Record<string, string>; body?: string } = {},
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

export { vi };
