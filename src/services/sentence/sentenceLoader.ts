import type { Card } from '../../domain/card';
import type { BankLookup } from '../../domain/game/gapFill';
import type { MeasureWordTable } from '../../domain/game/measureWord';
import { bankSentencesFor } from '../../domain/sentence/bankSentences';
import { createRuleResources, type RuleResources } from '../../domain/sentence/frequentErrors';
import {
  parseHskWords,
  parseMeasureWords,
  parseSentenceBank,
  type BankSentence,
  type DataIssue,
  type HskWord,
  type SentenceBank,
} from '../../domain/sentence/sentenceData';
import { createKnownWords } from '../../domain/sentence/words';
import type { Result } from '../../domain/result';
import { lazyLoader } from '../lazyLoader';

/** The data files of public/data/ (DESIGN.md 5 ter), served by the app itself. */
export const SENTENCE_FILES = {
  bank: 'data/sentences-zh.json',
  measureWords: 'data/measure-words.json',
  hsk: 'data/hsk-words.json',
} as const;

/** Twice the size budget of the bank: a larger file is not ours, it is never parsed. */
export const MAX_SENTENCE_FILE_CHARACTERS = 3_000_000;

/** Reads a file of the app as text; the browser's fetch in the app, a fake in tests. */
export type FetchText = (url: string) => Promise<string>;

export interface SentenceResources {
  bank: SentenceBank;
  measureWords: MeasureWordTable;
  hsk: ReadonlyMap<string, HskWord>;
  /** What the frequent error rules need, built once. */
  rules: RuleResources;
}

/** The browser's fetch, on the app's own origin: the CSP allows nothing else (connect-src). */
export const fetchAppText: FetchText = async (url) => {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)}`);
  }
  return response.text();
};

async function readFile<T>(
  fetchText: FetchText,
  url: string,
  parse: (json: unknown) => Result<T, DataIssue>,
): Promise<T> {
  const text = await fetchText(url);
  let json: unknown;
  if (text.length > MAX_SENTENCE_FILE_CHARACTERS) {
    throw new Error(`${url} is too large`);
  }
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${url} is not JSON`);
  }
  const parsed = parse(json);
  if (!parsed.ok) {
    throw new Error(`${url} is not valid sentence data`);
  }
  return parsed.value;
}

/**
 * Loads the sentence data on the first sentence game, once, then shares it. The files are
 * untrusted until validated; a failed load is forgotten, so that the next call tries again.
 * The service worker keeps them for offline use (vite.config.ts, runtime caching).
 */
export function createSentenceLoader(
  fetchText: FetchText,
  base: string,
): () => Promise<SentenceResources> {
  return lazyLoader(async () => {
    const [bank, measureWords, hsk] = await Promise.all([
      readFile(fetchText, `${base}${SENTENCE_FILES.bank}`, parseSentenceBank),
      readFile(fetchText, `${base}${SENTENCE_FILES.measureWords}`, parseMeasureWords),
      readFile(fetchText, `${base}${SENTENCE_FILES.hsk}`, parseHskWords),
    ]);
    return { bank, measureWords, hsk, rules: createRuleResources(measureWords, hsk) };
  });
}

/** The known words of a learner: HSK 1 to 3 and their Chinese words. */
export function knownWordsFor(
  { hsk }: SentenceResources,
  cards: readonly Card[],
): ReadonlySet<string> {
  return createKnownWords(
    hsk,
    cards.filter(({ language }) => language === 'zh').map(({ term }) => term),
  );
}

/** The bank sentences of each word of a learner, looked up once per word. */
export function bankLookupFor(resources: SentenceResources, cards: readonly Card[]): BankLookup {
  const known = knownWordsFor(resources, cards);
  const found = new Map<string, readonly BankSentence[]>();
  return (card) => {
    const cached = found.get(card.term);
    if (cached !== undefined) {
      return cached;
    }
    const sentences = bankSentencesFor(card.term, resources.bank, known);
    found.set(card.term, sentences);
    return sentences;
  };
}
