import { createRuleResources } from '../../domain/sentence/frequentErrors';
import type { BankSentence, HskWord } from '../../domain/sentence/sentenceData';
import type { SentenceResources } from '../../services/sentence/sentenceLoader';

export function bankSentence(
  id: number,
  cut: string,
  translation = 'Traduction.',
  lang: 'fr' | 'en' = 'fr',
): BankSentence {
  const words = cut.split(' ');
  return {
    id,
    author: 'sysko',
    words,
    text: words.join(''),
    translation: { lang, id: id + 1000, author: 'Scott', text: translation },
    t2s: id % 2 === 0,
    cc0: false,
  };
}

const HSK_WORDS: readonly (readonly [string, number, string])[] = [
  ['我', 1, 'r'],
  ['你', 1, 'r'],
  ['他', 1, 'r'],
  ['的', 1, 'u'],
  ['是', 1, 'v'],
  ['有', 1, 'v'],
  ['很', 1, 'd'],
  ['高', 1, 'a'],
  ['来', 1, 'v'],
  ['了', 1, 'u'],
  ['书', 1, 'n'],
  ['猫', 1, 'n'],
  ['狗', 1, 'n'],
  ['朋友', 1, 'n'],
  ['三', 1, 'm'],
  ['本', 1, 'q'],
  ['信封', 5, 'n'],
];

/** A small sentence data: a few HSK words, measure words and bank sentences. */
export function sentenceResources(sentences: readonly BankSentence[] = []): SentenceResources {
  const hsk = new Map<string, HskWord>(
    HSK_WORDS.map(([word, level, pos]) => [word, { level, pos: [pos] }]),
  );
  const measureWords = new Map([
    ['书', ['本']],
    ['猫', ['只']],
    ['狗', ['只', '条']],
    ['朋友', ['个', '位']],
    ['信封', ['个']],
  ]);
  return {
    bank: { sentences },
    measureWords,
    hsk,
    rules: createRuleResources(measureWords, hsk),
  };
}
