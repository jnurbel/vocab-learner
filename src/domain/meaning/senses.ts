/**
 * The characters that separate the senses of a meaning: "contrôler, contrôle / surveiller".
 * The vertical bar is one too, for the words saved before it was turned into a slash.
 */
export const SENSE_SEPARATORS: readonly string[] = [',', ';', '/', '|'];

const SEPARATOR_SET = new Set(SENSE_SEPARATORS);

export function isSenseSeparator(character: string): boolean {
  return SEPARATOR_SET.has(character);
}
