import { allowedOrigins, corsHeaders, preflightResponse } from './cors.ts';
import { errorResponse } from './http.ts';

/** Variables and secrets of the Worker (see wrangler.toml and worker/README.md). */
export interface Env {
  /** Comma-separated list of the web origins allowed to call the Worker. */
  ALLOWED_ORIGINS?: string;
}

/** Collaborators injected by the Worker entry point, faked in the tests. */
export type Deps = object;

const PHOTO_PATH = '/v1/photo';

export async function handleRequest(request: Request, env: Env, _deps: Deps): Promise<Response> {
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
  return Promise.resolve(new Response(null, { status: 501 }));
}
