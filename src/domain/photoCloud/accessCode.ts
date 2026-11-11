import { codePointLength } from '../text';
import { failure, success, type Result } from '../result';

/** Bounds of the family access code given by the parent who pays for the photo readings. */
export const ACCESS_CODE_LENGTH = { min: 8, max: 64 } as const;

export type AccessCodeError = 'tooShort' | 'tooLong' | 'invalidCharacters';

/**
 * Printable ASCII only: the code travels in the Authorization header, which can carry neither a
 * control character (a line break would split the request) nor most non-Latin characters.
 */
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;

/** Checks the access code typed by the parent; the spaces around it are dropped. */
export function checkAccessCode(raw: string): Result<string, AccessCodeError> {
  const code = raw.trim();
  const length = codePointLength(code);
  if (length < ACCESS_CODE_LENGTH.min) {
    return failure(['tooShort']);
  }
  if (length > ACCESS_CODE_LENGTH.max) {
    return failure(['tooLong']);
  }
  if (!PRINTABLE_ASCII.test(code)) {
    return failure(['invalidCharacters']);
  }
  return success(code);
}
