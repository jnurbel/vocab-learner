import { authorizedCodeHash } from './accessCode.ts';
import { announcesTooLargeBody, readBoundedText } from './body.ts';
import { allowedOrigins, corsHeaders, preflightResponse } from './cors.ts';
import { errorResponse } from './http.ts';
import {
  dailyLimit,
  photosUsed,
  quotaKey,
  secondsUntilUtcMidnight,
  type QuotaStore,
} from './quota.ts';

/** Variables and secrets of the Worker (see wrangler.toml and worker/README.md). */
export interface Env {
  /** Comma-separated list of the web origins allowed to call the Worker. */
  ALLOWED_ORIGINS?: string;
  /** Secret: comma-separated SHA-256 hex hashes of the family access codes. */
  ACCESS_CODE_HASHES?: string;
  /** Photos a code may have read per UTC day (default 30). */
  DAILY_LIMIT?: string;
}

/** Collaborators injected by the Worker entry point, faked in the tests. */
export interface Deps {
  /** The QUOTA KV namespace. */
  quota: QuotaStore;
  now: () => Date;
}

const PHOTO_PATH = '/v1/photo';

export async function handleRequest(request: Request, env: Env, deps: Deps): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (origin === null || !allowedOrigins(env.ALLOWED_ORIGINS).has(origin)) {
    return errorResponse('forbidden_origin');
  }
  const cors = corsHeaders(origin);
  if (new URL(request.url).pathname !== PHOTO_PATH) {
    return errorResponse('not_found', cors);
  }
  if (request.method === 'OPTIONS') {
    return preflightResponse(origin);
  }
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', { ...cors, Allow: 'POST, OPTIONS' });
  }
  if (announcesTooLargeBody(request)) {
    return errorResponse('too_large', cors);
  }
  const body = await readBoundedText(request);
  if (body === null) {
    return errorResponse('too_large', cors);
  }
  const codeHash = await authorizedCodeHash(
    request.headers.get('Authorization'),
    env.ACCESS_CODE_HASHES,
  );
  if (codeHash === null) {
    return errorResponse('unauthorized', cors);
  }
  const now = deps.now();
  const key = quotaKey(codeHash, now);
  const used = await photosUsed(deps.quota, key);
  if (used >= dailyLimit(env.DAILY_LIMIT)) {
    return errorResponse('quota_exceeded', {
      ...cors,
      'Retry-After': String(secondsUntilUtcMidnight(now)),
    });
  }
  return new Response(null, { status: 501 });
}
