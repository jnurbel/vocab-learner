import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/handler.ts';
import {
  ACCESS_CODE,
  makeDeps,
  makeEnv,
  MemoryQuotaStore,
  photoRequest,
  TODAY_KEY,
} from './support.ts';

function authorizedRequest(): Request {
  return photoRequest({ headers: { Authorization: `Bearer ${ACCESS_CODE}` }, body: '{}' });
}

describe('daily quota', () => {
  it('refuses with 429 quota_exceeded once the 30 photos of the day are used', async () => {
    const quota = new MemoryQuotaStore();
    quota.values.set(TODAY_KEY, '30');

    const response = await handleRequest(authorizedRequest(), makeEnv(), makeDeps({ quota }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'quota_exceeded' });
  });

  it('tells in Retry-After how many seconds are left until 00:00 UTC', async () => {
    const quota = new MemoryQuotaStore();
    quota.values.set(TODAY_KEY, '30');

    const response = await handleRequest(
      authorizedRequest(),
      makeEnv(),
      makeDeps({ quota, now: () => new Date('2026-11-11T23:58:59.500Z') }),
    );

    expect(response.headers.get('Retry-After')).toBe('61');
  });

  it('keys the quota by the hash of the code and the UTC day, never by the code itself', async () => {
    const quota = new MemoryQuotaStore();
    quota.values.set(TODAY_KEY, '30');
    quota.values.set(`${ACCESS_CODE}:2026-11-11`, '0');

    const response = await handleRequest(authorizedRequest(), makeEnv(), makeDeps({ quota }));

    expect(response.status).toBe(429);
  });

  it('applies the daily limit set by DAILY_LIMIT', async () => {
    const quota = new MemoryQuotaStore();
    quota.values.set(TODAY_KEY, '2');

    const response = await handleRequest(
      authorizedRequest(),
      makeEnv({ DAILY_LIMIT: '2' }),
      makeDeps({ quota }),
    );

    expect(response.status).toBe(429);
  });

  it.each(['', 'abc', '0', '-3', '2.5'])(
    'falls back to 30 photos a day when DAILY_LIMIT is "%s"',
    async (limit) => {
      const quota = new MemoryQuotaStore();
      quota.values.set(TODAY_KEY, '29');

      const response = await handleRequest(
        authorizedRequest(),
        makeEnv({ DAILY_LIMIT: limit }),
        makeDeps({ quota }),
      );

      expect(response.status).not.toBe(429);
    },
  );

  it('lets a code read photos while it is under its daily limit', async () => {
    const quota = new MemoryQuotaStore();
    quota.values.set(TODAY_KEY, '29');
    quota.values.set(`${TODAY_KEY.split(':')[0] ?? ''}:2026-11-10`, '30');

    const response = await handleRequest(authorizedRequest(), makeEnv(), makeDeps({ quota }));

    expect(response.status).not.toBe(429);
  });

  it('treats an unreadable counter as a full quota, failing closed', async () => {
    const quota = new MemoryQuotaStore();
    quota.values.set(TODAY_KEY, 'garbage');

    const response = await handleRequest(authorizedRequest(), makeEnv(), makeDeps({ quota }));

    expect(response.status).toBe(429);
  });
});
