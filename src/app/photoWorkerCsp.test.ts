/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allowPhotoWorker, photoWorkerOrigin } from './photoWorkerCsp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

function policyOf(html: string): string {
  const match = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
  return match?.[1] ?? '';
}

describe('photoWorkerOrigin', () => {
  it('offers no photo reading by Claude when the build has no worker address', () => {
    expect(photoWorkerOrigin(undefined)).toBeUndefined();
    expect(photoWorkerOrigin('')).toBeUndefined();
    expect(photoWorkerOrigin('   ')).toBeUndefined();
  });

  it('keeps only the origin of an https worker address', () => {
    expect(photoWorkerOrigin('https://photo.example.workers.dev/v1/photo?x=1')).toBe(
      'https://photo.example.workers.dev',
    );
  });

  it('accepts a worker on localhost over http, for local tests', () => {
    expect(photoWorkerOrigin('http://localhost:8787')).toBe('http://localhost:8787');
  });

  it('refuses a worker reached over plain http on another host', () => {
    expect(() => photoWorkerOrigin('http://photo.example.workers.dev')).toThrow(
      'VITE_PHOTO_WORKER_URL must use https',
    );
    expect(() => photoWorkerOrigin('http://localhost.evil.example')).toThrow('https');
  });

  it('refuses an address that is not a web url', () => {
    expect(() => photoWorkerOrigin('not a url')).toThrow('VITE_PHOTO_WORKER_URL is not a URL');
    expect(() => photoWorkerOrigin(['javascript', 'alert(1)'].join(':'))).toThrow('https');
    expect(() => photoWorkerOrigin('data:text/plain,hi')).toThrow('https');
  });

  it('refuses an address that would break out of the policy', () => {
    expect(() => photoWorkerOrigin("https://a.example/'; script-src *")).not.toThrow();
    expect(photoWorkerOrigin("https://a.example/'; script-src *")).toBe('https://a.example');
    expect(() => photoWorkerOrigin('https://user:secret@a.example')).toThrow('credentials');
  });
});

describe('allowPhotoWorker', () => {
  it('leaves the policy as it is without a worker', () => {
    expect(allowPhotoWorker(indexHtml, undefined)).toBe(indexHtml);
  });

  it('adds the worker origin to connect-src and changes nothing else in the policy', () => {
    const before = policyOf(indexHtml);
    const after = policyOf(allowPhotoWorker(indexHtml, 'https://photo.example.workers.dev'));

    expect(after).toBe(
      before.replace("connect-src 'self'", "connect-src 'self' https://photo.example.workers.dev"),
    );
    expect(after).not.toBe(before);
  });

  it('refuses a page whose policy has no connect-src to extend', () => {
    expect(() => allowPhotoWorker('<html></html>', 'https://a.example')).toThrow('connect-src');
  });
});
