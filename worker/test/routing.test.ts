import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/handler.ts';
import { ALLOWED_ORIGIN, makeDeps, makeEnv, photoRequest } from './support.ts';

describe('routing', () => {
  it('answers 404 not_found on another path, with the CORS and security headers', async () => {
    const response = await handleRequest(
      photoRequest({ path: '/v1/other' }),
      makeEnv(),
      makeDeps(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe(
      'X-Quota-Remaining, Retry-After',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('answers 404 to a preflight on another path', async () => {
    const response = await handleRequest(
      photoRequest({ method: 'OPTIONS', path: '/' }),
      makeEnv(),
      makeDeps(),
    );

    expect(response.status).toBe(404);
  });

  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])(
    'answers 405 method_not_allowed to %s on the photo route',
    async (method) => {
      const response = await handleRequest(photoRequest({ method }), makeEnv(), makeDeps());

      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ error: 'method_not_allowed' });
      expect(response.headers.get('Allow')).toBe('POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    },
  );
});
