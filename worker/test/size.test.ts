import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/handler.ts';
import { ALLOWED_ORIGIN, makeDeps, makeEnv, photoRequest, WORKER_URL } from './support.ts';

const FOUR_MB = 4 * 1024 * 1024;

function streamedRequest(size: number): Request {
  const chunk = new Uint8Array(64 * 1024).fill(0x61);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) {
        controller.close();
        return;
      }
      const part = chunk.subarray(0, Math.min(chunk.length, size - sent));
      sent += part.length;
      controller.enqueue(part);
    },
  });
  return new Request(`${WORKER_URL}/v1/photo`, {
    method: 'POST',
    headers: { Origin: ALLOWED_ORIGIN },
    body,
    duplex: 'half',
  } as RequestInit);
}

describe('body size', () => {
  it('refuses with 413 too_large a body announced over 4 MB, before reading it', async () => {
    const request = photoRequest({
      headers: { 'Content-Length': String(FOUR_MB + 1) },
      body: '{}',
    });

    const response = await handleRequest(request, makeEnv(), makeDeps());

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'too_large' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(request.bodyUsed).toBe(false);
  });

  it('refuses with 413 a body that turns out to be over 4 MB without announcing it', async () => {
    const response = await handleRequest(streamedRequest(FOUR_MB + 1), makeEnv(), makeDeps());

    expect(response.status).toBe(413);
  });

  it('reads a POST without a body as an empty body, not as a too large one', async () => {
    const response = await handleRequest(photoRequest(), makeEnv(), makeDeps());

    expect(response.status).not.toBe(413);
  });

  it('reads a body of exactly 4 MB', async () => {
    const response = await handleRequest(streamedRequest(FOUR_MB), makeEnv(), makeDeps());

    expect(response.status).not.toBe(413);
  });
});
