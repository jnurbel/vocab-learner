/**
 * Family access codes. Only their SHA-256 hashes are configured (secret ACCESS_CODE_HASHES), and
 * the hash, never the code, identifies the family in the quota store.
 */

/** Longer codes are refused unhashed: real codes are short, a huge header is an attack. */
const MAX_CODE_LENGTH = 256;
const BEARER = /^Bearer ([\x21-\x7e]+)$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function configuredHashes(list: string | undefined): string[] {
  return (list ?? '')
    .split(',')
    .map((hash) => hash.trim().toLowerCase())
    .filter((hash) => SHA256_HEX.test(hash));
}

/** Compares two hashes of the same length without returning early on the first difference. */
function sameHash(left: string, right: string): boolean {
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Returns the hash of the access code carried by `Authorization: Bearer <code>` when it is one of
 * the configured hashes, else null. Every configured hash is compared, in constant time.
 */
export async function authorizedCodeHash(
  authorization: string | null,
  hashList: string | undefined,
): Promise<string | null> {
  if (authorization === null || authorization.length > MAX_CODE_LENGTH + 'Bearer '.length) {
    return null;
  }
  const code = BEARER.exec(authorization)?.[1];
  if (code === undefined) {
    return null;
  }
  const hash = await sha256Hex(code);
  let known = false;
  for (const configured of configuredHashes(hashList)) {
    known = sameHash(hash, configured) || known;
  }
  return known ? hash : null;
}
