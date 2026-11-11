/** Spaces (not line breaks) between two Han characters or Chinese punctuation marks. */
const SPACES_BETWEEN_CHINESE =
  /(?<=[\p{Script=Han}，。！？；：、（）《》「」])[^\S\n]+(?=[\p{Script=Han}，。！？；：、（）《》「」])/gu;

/**
 * Tidies the text read from a photo: the reader separates Chinese characters with spaces that
 * the text does not have, and leaves blank lines and margins.
 */
export function cleanRecognizedText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(SPACES_BETWEEN_CHINESE, '').trim())
    .filter((line) => line !== '')
    .join('\n');
}
