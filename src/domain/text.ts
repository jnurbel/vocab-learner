import { failure, success, type Result } from './result';

export type TextFieldReason = 'required' | 'tooLong';

/** Length in Unicode code points, so that a rare hanzi outside the BMP counts as one character. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** Trims a user-entered text and checks it against a maximum length; blank means missing. */
export function checkText(
  raw: string | undefined,
  maxLength: number,
): Result<string, TextFieldReason> {
  const value = raw?.trim() ?? '';
  if (value === '') {
    return failure(['required']);
  }
  if (codePointLength(value) > maxLength) {
    return failure(['tooLong']);
  }
  return success(value);
}
