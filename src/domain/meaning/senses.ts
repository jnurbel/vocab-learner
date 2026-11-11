/**
 * What separates the senses of a meaning: "contrôler, contrôle / surveiller". The vertical bar
 * is one too, for the words saved with it before it was turned into a slash.
 */
export const SENSE_SEPARATOR = /[,;/|]/;

export function isSenseSeparator(character: string): boolean {
  return SENSE_SEPARATOR.test(character);
}
