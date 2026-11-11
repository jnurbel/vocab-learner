import { describe, expect, it } from 'vitest';
import { cleanRecognizedText } from './recognizedText';

describe('cleanRecognizedText', () => {
  it('removes the spaces that the reader puts between Chinese characters', () => {
    expect(cleanRecognizedText('今 天 是 中 秋 节 。')).toBe('今天是中秋节。');
  });

  it('keeps the spaces between English words and between Chinese and English', () => {
    expect(cleanRecognizedText('I like 月 饼 and tea')).toBe('I like 月饼 and tea');
  });

  it('keeps the lines, trims them and drops the empty ones', () => {
    expect(cleanRecognizedText('  你 好 | bonjour  \n\n\n apple | pomme \n')).toBe(
      '你好 | bonjour\napple | pomme',
    );
  });

  it('removes the spaces around Chinese punctuation', () => {
    expect(cleanRecognizedText('我 们 ， 吃 月 饼 ！')).toBe('我们，吃月饼！');
  });
});
