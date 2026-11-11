/** Hosts a worker may be reached on over plain http: a worker run on the developer's machine. */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

const CONNECT_SRC = "connect-src 'self'";

/**
 * The origin of the worker that has photos read by Claude (VITE_PHOTO_WORKER_URL), or undefined
 * when the build has none: the option is then not offered at all. Throws at build time on an
 * address the Content Security Policy must not allow: anything but https, except a local worker.
 */
export function photoWorkerOrigin(url: string | undefined): string | undefined {
  const trimmed = url?.trim() ?? '';
  if (trimmed === '') {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('VITE_PHOTO_WORKER_URL is not a URL');
  }
  const local = parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !local) {
    throw new Error('VITE_PHOTO_WORKER_URL must use https (or http on localhost)');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('VITE_PHOTO_WORKER_URL must not hold credentials');
  }
  return parsed.origin;
}

/** Lets the page reach the worker: its origin is added to connect-src, nothing else changes. */
export function allowPhotoWorker(html: string, origin: string | undefined): string {
  if (origin === undefined) {
    return html;
  }
  if (!html.includes(CONNECT_SRC)) {
    throw new Error(`The Content Security Policy has no "${CONNECT_SRC}" to extend`);
  }
  return html.replace(CONNECT_SRC, `${CONNECT_SRC} ${origin}`);
}
