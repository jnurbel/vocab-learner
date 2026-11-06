import { describe, expect, it, vi } from 'vitest';
import type { PinyinGenerator } from '../pinyinGeneration';
import { compareAnswer } from './answerCompare';

/** A tiny pinyin table, enough for the words of these tests. */
const PINYIN: Readonly<Record<string, string>> = {
  在: 'zài',
  再: 'zài',
  见: 'jiàn',
  件: 'jiàn',
  你: 'nǐ',
  好: 'hǎo',
  号: 'hào',
};
const fakePinyin: PinyinGenerator = (hanzi) =>
  Array.from(hanzi, (char) => PINYIN[char] ?? char).join(' ');

function pinyinLoader() {
  return vi.fn(() => Promise.resolve(fakePinyin));
}

const zh = (expected: string, given: string, loadPinyin = pinyinLoader()) =>
  compareAnswer({ language: 'zh', expected, given }, { loadPinyin });

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

  it('tells a same-sounding answer written with other characters, which stays wrong', async () => {
    const result = await zh('再见', '在见');

    expect(result.outcome).toBe('wrong');
    expect(result.reason).toBe('sameSoundOtherCharacter');
  });

  it('gives no reason when the sound differs too', async () => {
    const result = await zh('你好', '你号');

    expect(result.outcome).toBe('wrong');
    expect(result.reason).toBeUndefined();
  });

  it('does not take pinyin typed in Latin letters for a same-sounding character', async () => {
    expect((await zh('再', 'zài')).reason).toBeUndefined();
  });

  it('loads the pinyin only when an answer in hanzi is wrong', async () => {
    const loadPinyin = pinyinLoader();

    await zh('你好', '你好', loadPinyin);
    await zh('你好', 'nihao', loadPinyin);

    expect(loadPinyin).not.toHaveBeenCalled();
  });
});

const en = (expected: string, given: string, loadPinyin = pinyinLoader()) =>
  compareAnswer({ language: 'en', expected, given }, { loadPinyin });

describe('compareAnswer in English', () => {
  it('ignores case, extra spaces and typographic apostrophes', async () => {
    expect((await en('ice cream', '  Ice   CREAM ')).outcome).toBe('correct');
    expect((await en("don't", 'don’t')).outcome).toBe('correct');
    expect((await en('don’t', "DON'T")).outcome).toBe('correct');
  });

  it('accepts a verb with or without "to"', async () => {
    expect((await en('to run', 'run')).outcome).toBe('correct');
    expect((await en('run', 'to run')).outcome).toBe('correct');
    expect((await en('to', '')).outcome).toBe('wrong');
  });

  it('marks a different word as wrong, with the diff of the letters', async () => {
    const result = await en('cat', 'cut');

    expect(result.outcome).toBe('wrong');
    expect(result.diff).toEqual([
      { kind: 'correct', given: 'c', expected: 'c' },
      { kind: 'wrong', given: 'u', expected: 'a' },
      { kind: 'correct', given: 't', expected: 't' },
    ]);
  });

  it('never loads the pinyin', async () => {
    const loadPinyin = pinyinLoader();

    await en('cat', 'cut', loadPinyin);

    expect(loadPinyin).not.toHaveBeenCalled();
  });
});
