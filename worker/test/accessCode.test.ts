import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/handler.ts';
import { ACCESS_CODE, makeDeps, makeEnv, photoRequest, sha256Hex } from './support.ts';

function withAuthorization(value: string): Request {
  return photoRequest({ headers: { Authorization: value }, body: '{}' });
}

describe('access code', () => {
  it('refuses with 401 unauthorized a request without an access code', async () => {
    const response = await handleRequest(photoRequest({ body: '{}' }), makeEnv(), makeDeps());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('refuses with 401 an unknown access code', async () => {
    const response = await handleRequest(
      withAuthorization('Bearer not-the-family-code'),
      makeEnv(),
      makeDeps(),
    );

    expect(response.status).toBe(401);
  });

  it.each([`Basic ${ACCESS_CODE}`, 'Bearer ', ACCESS_CODE, `Bearer ${ACCESS_CODE} extra`])(
    'refuses with 401 the malformed Authorization header "%s"',
    async (header) => {
      const response = await handleRequest(withAuthorization(header), makeEnv(), makeDeps());

      expect(response.status).toBe(401);
    },
  );

  it('refuses with 401 an oversized access code without hashing it', async () => {
    const response = await handleRequest(
      withAuthorization(`Bearer ${'x'.repeat(10_000)}`),
      makeEnv(),
      makeDeps(),
    );

    expect(response.status).toBe(401);
  });

  it('refuses every code when no access code hash is configured', async () => {
    const response = await handleRequest(
      withAuthorization(`Bearer ${ACCESS_CODE}`),
      makeEnv({ ACCESS_CODE_HASHES: undefined }),
      makeDeps(),
    );

    expect(response.status).toBe(401);
  });

  it('accepts a code whose SHA-256 hash is in the configured list', async () => {
    const response = await handleRequest(
      withAuthorization(`Bearer ${ACCESS_CODE}`),
      makeEnv(),
      makeDeps(),
    );

    expect(response.status).not.toBe(401);
  });

  it('accepts a hash listed in upper case among spaces and other hashes', async () => {
    const hashes = ` ${'0'.repeat(64)} ,${(await sha256Hex(ACCESS_CODE)).toUpperCase()}, not-a-hash`;

    const response = await handleRequest(
      withAuthorization(`Bearer ${ACCESS_CODE}`),
      makeEnv({ ACCESS_CODE_HASHES: hashes }),
      makeDeps(),
    );

    expect(response.status).not.toBe(401);
  });
});
