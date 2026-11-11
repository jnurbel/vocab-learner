import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/handler.ts';
import { ALLOWED_ORIGIN, makeDeps, makeEnv, photoRequest } from './support.ts';

describe('CORS', () => {
  it('refuses a request from an origin that is not allowed', async () => {
    const response = await handleRequest(
      photoRequest({ origin: 'https://evil.example' }),
      makeEnv(),
      makeDeps(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden_origin' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('refuses a request without an Origin header', async () => {
    const response = await handleRequest(photoRequest({ origin: null }), makeEnv(), makeDeps());

    expect(response.status).toBe(403);
  });

  it('refuses every origin when no origin is configured', async () => {
    const response = await handleRequest(
      photoRequest(),
      makeEnv({ ALLOWED_ORIGINS: undefined }),
      makeDeps(),
    );

    expect(response.status).toBe(403);
  });

  it('answers the preflight of an allowed origin with the CORS headers of the contract', async () => {
    const response = await handleRequest(
      photoRequest({ method: 'OPTIONS' }),
      makeEnv(),
      makeDeps(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'authorization, content-type',
    );
    expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('accepts every origin of the comma-separated list', async () => {
    const response = await handleRequest(
      photoRequest({ method: 'OPTIONS', origin: 'http://localhost:5173' }),
      makeEnv(),
      makeDeps(),
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });
});
