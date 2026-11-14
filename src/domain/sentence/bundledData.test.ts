/// <reference types="node" />
// Node types are needed here only, to read the data files shipped in public/data/.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isBlockedChinese, isBlockedTranslation } from '../../../scripts/sentences/blocklist';
import { parseHskWords, parseMeasureWords, parseSentenceBank } from './sentenceData';

const dataFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'public',
  'data',
);
const fileOf = (name: string) => join(dataFolder, name);
// eslint-disable-next-line security/detect-non-literal-fs-filename -- the listed data files only
const json = (name: string): unknown => JSON.parse(readFileSync(fileOf(name), 'utf8'));

/** A phone downloads them on the first sentence game (DESIGN.md 5 ter). */
const MAX_BYTES = {
  'sentences-zh.json': 1_500_000,
  'measure-words.json': 200_000,
  'hsk-words.json': 200_000,
} as const;

describe('the sentence data shipped with the app', () => {
  it.each(Object.entries(MAX_BYTES))('keeps %s under its size budget', (name, max) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- listed data files only
    expect(statSync(fileOf(name)).size).toBeLessThanOrEqual(max);
  });

  it('ships a sentence bank in the expected format, every sentence attributed', () => {
    const bank = parseSentenceBank(json('sentences-zh.json'));

    expect(bank.ok).toBe(true);
    const sentences = bank.ok ? bank.value.sentences : [];
    expect(sentences.length).toBeGreaterThan(1_000);
    expect(
      sentences.every(({ author, translation }) => author !== '' && translation.author !== ''),
    ).toBe(true);
  });

  it('ships no sentence nor translation holding a blocklisted word', () => {
    const bank = parseSentenceBank(json('sentences-zh.json'));
    const sentences = bank.ok ? bank.value.sentences : [];

    const blocked = sentences.filter(
      ({ text, translation }) => isBlockedChinese(text) || isBlockedTranslation(translation.text),
    );

    expect(blocked.map(({ id }) => id)).toEqual([]);
  });

  it('blocks whole words of a translation, whatever their case or accents', () => {
    expect(isBlockedTranslation('Quel CON !')).toBe(true);
    expect(isBlockedTranslation('Il a été tué.')).toBe(true);
    expect(isBlockedTranslation('Le constat du concert est bon.')).toBe(false);
    expect(isBlockedTranslation('Hello, Mr. Shotwell.')).toBe(false);
  });

  it('blocks a Chinese word anywhere in the sentence', () => {
    expect(isBlockedChinese('他杀了一只鸡。')).toBe(true);
    expect(isBlockedChinese('我有三本书。')).toBe(false);
  });

  it('ships the measure words and the HSK words in the expected format', () => {
    expect(parseMeasureWords(json('measure-words.json')).ok).toBe(true);
    expect(parseHskWords(json('hsk-words.json')).ok).toBe(true);
  });
});
