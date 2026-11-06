/** Computes the hexadecimal SHA-256 fingerprint of a text; asynchronous, as WebCrypto is. */
export type Sha256 = (text: string) => Promise<string>;

/** The part of WebCrypto used here, injected so that tests and other runtimes can provide it. */
export type DigestProvider = Pick<SubtleCrypto, 'digest'>;

/** SHA-256 of the UTF-8 bytes of a text, through WebCrypto (`crypto.subtle` in the browser). */
export function sha256With(subtle: DigestProvider): Sha256 {
  return async (text) => {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  };
}
