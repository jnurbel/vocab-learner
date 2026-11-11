/** CORS of the photo API: the allowed origins are listed, no credentials are ever allowed. */

export function allowedOrigins(list: string | undefined): Set<string> {
  return new Set(
    (list ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
  );
}

/** Headers carried by every response to an allowed origin. */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Expose-Headers': 'X-Quota-Remaining, Retry-After',
    Vary: 'Origin',
  };
}

export function preflightResponse(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
