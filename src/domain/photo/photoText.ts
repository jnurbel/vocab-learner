import type { DetectedBlock } from './photoBlocks';
import { centerY, hasHan, isText } from './tableGrid';

/** The reading of a block: the Chinese model for hanzi, else the surer of the two models. */
function textOf({ chinese, latin }: DetectedBlock): string {
  if (hasHan(chinese.text) || chinese.confidence > latin.confidence) {
    return chinese.text.trim();
  }
  return latin.text.trim();
}

/** Hanzi follow each other without spaces; anything else is separated by one. */
function join(line: string, next: string): string {
  return hasHan(line.slice(-1)) && hasHan(next.slice(0, 1)) ? `${line}${next}` : `${line} ${next}`;
}

/**
 * The text of a photographed page: its blocks put in lines (a block joins the line whose middle
 * it covers), from top to bottom, each from left to right.
 */
export function blocksToText(blocks: readonly DetectedBlock[]): string {
  const lines: DetectedBlock[][] = [];
  for (const block of [...blocks].filter(isText).sort((one, other) => one.box.y - other.box.y)) {
    const line = lines.find((candidate) =>
      candidate.some(
        ({ box }) => block.box.y <= centerY(box) && centerY(box) <= block.box.y + block.box.height,
      ),
    );
    if (line === undefined) {
      lines.push([block]);
    } else {
      line.push(block);
    }
  }
  return lines
    .map((line) =>
      line
        .sort((one, other) => one.box.x - other.box.x)
        .map(textOf)
        .reduce(join),
    )
    .join('\n');
}
