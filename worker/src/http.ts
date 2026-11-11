/** Error codes of the photo API contract (docs/PHOTO_API.md). */
export type ErrorCode =
  | 'unauthorized'
  | 'forbidden_origin'
  | 'not_found'
  | 'method_not_allowed'
  | 'too_large'
  | 'quota_exceeded';

const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden_origin: 403,
  not_found: 404,
  method_not_allowed: 405,
  too_large: 413,
  quota_exceeded: 429,
};

/** Nothing is cached anywhere, and the browser must not sniff another content type. */
const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function errorResponse(code: ErrorCode, headers: Record<string, string> = {}): Response {
  return Response.json(
    { error: code },
    { status: ERROR_STATUS[code], headers: { ...SECURITY_HEADERS, ...headers } },
  );
}
