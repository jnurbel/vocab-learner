import { describe, expect, it } from 'vitest';
import type { DetectedBlock } from './photoBlocks';
import { blocksToText } from './photoText';

function block(
  x: number,
  y: number,
  chinese: string,
  latin = '',
  confidences: readonly [number, number] = [0.95, 0.9],
): DetectedBlock {
  return {
    box: { x, y, width: 200, height: 40 },
    chinese: { text: chinese, confidence: confidences[0] },
    latin: { text: latin, confidence: confidences[1] },
  };
}

describe('blocksToText', () => {
  it('writes the lines of a printed text from top to bottom, each from left to right', () => {
    const text = blocksToText([
      block(300, 102, '月饼。'),
      block(10, 100, '我们吃'),
      block(10, 200, 'The moon', 'The moon'),
      block(300, 205, 'is bright.', 'is bright.'),
    ]);

    expect(text).toBe('我们吃月饼。\nThe moon is bright.');
  });

  it('takes the Latin reading of Latin text when it is surer, for its accents', () => {
    expect(blocksToText([block(10, 10, 'La fete', 'La fête', [0.8, 0.95])])).toBe('La fête');
    expect(blocksToText([block(10, 10, 'moon', 'mon', [0.95, 0.6])])).toBe('moon');
  });

  it('leaves out the noise', () => {
    expect(blocksToText([block(10, 10, '·', '', [0.1, 0])])).toBe('');
  });
});
