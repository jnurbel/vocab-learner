export type TextFieldReason = 'required' | 'tooLong';

/** Length in Unicode code points, so that a rare hanzi outside the BMP counts as one character. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** Trims a user-entered text and checks it against a maximum length; blank means missing. */
export function checkText(
  raw: string | undefined,
  maxLength: number,
): { value: string | undefined; problem: TextFieldReason | undefined } {
  const value = raw?.trim() ?? '';
  if (value === '') {
    return { value: undefined, problem: 'required' };
  }
  if (codePointLength(value) > maxLength) {
    return { value, problem: 'tooLong' };
  }
  return { value, problem: undefined };
}
