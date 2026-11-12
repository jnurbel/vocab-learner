/** The first fenced code block of a reply, its fence possibly followed by a language. */
const CODE_BLOCK = /```[^\n]*\n([\s\S]*?)(?:```|$)/;

/**
 * The CSV in a reply pasted from an AI: the content of its first code block when it has one,
 * as AIs often wrap a file in one with a few words around; else the text itself.
 */
export function csvFromReply(reply: string): string {
  const block = CODE_BLOCK.exec(reply);
  return (block?.[1] ?? reply).trim();
}
