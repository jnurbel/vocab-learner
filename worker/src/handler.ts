import { allowedOrigins, preflightResponse } from './cors.ts';
import { errorResponse } from './http.ts';

/** Variables and secrets of the Worker (see wrangler.toml and worker/README.md). */
export interface Env {
  /** Comma-separated list of the web origins allowed to call the Worker. */
  ALLOWED_ORIGINS?: string;
}

/** Collaborators injected by the Worker entry point, faked in the tests. */
export type Deps = object;

export function handleRequest(request: Request, env: Env, _deps: Deps): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (origin === null || !allowedOrigins(env.ALLOWED_ORIGINS).has(origin)) {
    return Promise.resolve(errorResponse('forbidden_origin'));
  }
  if (request.method === 'OPTIONS') {
    return Promise.resolve(preflightResponse(origin));
  }
  return Promise.resolve(new Response(null, { status: 501 }));
}
