/** Largest request body accepted, in bytes (photo API contract: 4 MB). */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** True when the client announces a body over the limit, so that it is refused unread. */
export function announcesTooLargeBody(request: Request): boolean {
  const announced = Number(request.headers.get('Content-Length'));
  return Number.isFinite(announced) && announced > MAX_BODY_BYTES;
}

/**
 * Reads the body as text, stopping as soon as it exceeds the limit: a client may omit or
 * understate Content-Length. Returns null when the body is too large.
 */
export async function readBoundedText(request: Request): Promise<string | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body !== null) {
    const reader = request.body.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(read.value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
