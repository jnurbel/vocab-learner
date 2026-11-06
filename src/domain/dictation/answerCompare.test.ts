import { describe, expect, it } from 'vitest';
import { compareAnswer } from './answerCompare';

const zh = (expected: string, given: string) => compareAnswer({ language: 'zh', expected, given });

describe('compareAnswer in Chinese', () => {
  it('accepts the exact hanzi as correct', async () => {
    const result = await zh('你好', '你好');

    expect(result.outcome).toBe('correct');
  });

  it('ignores spaces, the Unicode composition form and full-width punctuation', async () => {
    expect((await zh('你好', ' 你 好　')).outcome).toBe('correct');
    expect((await zh('你好！', '你好!')).outcome).toBe('correct');
    expect((await zh('你好!', '你好！')).outcome).toBe('correct');
    expect((await zh('好吗?', '好吗？')).outcome).toBe('correct');
    expect((await zh('好。', '好.')).outcome).toBe('correct');
    expect((await zh('é', 'é')).outcome).toBe('correct');
  });

  it('is strict about the characters themselves', async () => {
    expect((await zh('在', '再')).outcome).toBe('wrong');
  });

  it('marks every character of a correct answer as right', async () => {
    expect((await zh('你好', '你好')).diff).toEqual([
      { kind: 'correct', given: '你', expected: '你' },
      { kind: 'correct', given: '好', expected: '好' },
    ]);
  });

  it('shows a wrong character next to the expected one', async () => {
    expect((await zh('你好吗', '你们吗')).diff).toEqual([
      { kind: 'correct', given: '你', expected: '你' },
      { kind: 'wrong', given: '们', expected: '好' },
      { kind: 'correct', given: '吗', expected: '吗' },
    ]);
  });

  it('shows a missing character and an extra one', async () => {
    expect((await zh('你好吗', '你吗')).diff).toEqual([
      { kind: 'correct', given: '你', expected: '你' },
      { kind: 'missing', expected: '好' },
      { kind: 'correct', given: '吗', expected: '吗' },
    ]);
    expect((await zh('你好', '你好吗')).diff).toEqual([
      { kind: 'correct', given: '你', expected: '你' },
      { kind: 'correct', given: '好', expected: '好' },
      { kind: 'extra', given: '吗' },
    ]);
  });

  it('marks every character as missing when nothing was typed', async () => {
    const result = await zh('你好', '  ');

    expect(result.outcome).toBe('wrong');
    expect(result.diff).toEqual([
      { kind: 'missing', expected: '你' },
      { kind: 'missing', expected: '好' },
    ]);
  });

  it('counts a rare hanzi outside the basic plane as one character', async () => {
    expect((await zh('\u{20bb7}好', '\u{20bb7}们')).diff).toEqual([
      { kind: 'correct', given: '\u{20bb7}', expected: '\u{20bb7}' },
      { kind: 'wrong', given: '们', expected: '好' },
    ]);
  });
});
