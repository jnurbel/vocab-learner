import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import {
  bankLookupFor,
  fetchAppText,
  createSentenceLoader,
  SENTENCE_FILES,
  MAX_SENTENCE_FILE_CHARACTERS,
  type FetchText,
} from './sentenceLoader';

const bank = {
  format: 'vocab-learner-sentences',
  version: 1,
  authors: ['Tatoeba contributors', 'sysko'],
  sentences: [
    [1, 1, '我 的 朋友 来 了 。', 'fr', 2, 0, 'Mon ami est venu.'],
    [3, 1, '我 的 政府 。', 'fr', 4, 0, 'Mon gouvernement.'],
  ],
};
const measureWords = {
  format: 'vocab-learner-measure-words',
  version: 1,
  nouns: { 朋友: ['个', '位'] },
};
const hsk = {
  format: 'vocab-learner-hsk-words',
  version: 1,
  words: { 我: [1, 'r'], 的: [1, 'u'], 来: [1, 'v'], 朋友: [1, 'n'], 政府: [5, 'n'] },
};

function files(overrides: Record<string, unknown> = {}): FetchText {
  const all: Record<string, unknown> = {
    [SENTENCE_FILES.bank]: bank,
    [SENTENCE_FILES.measureWords]: measureWords,
    [SENTENCE_FILES.hsk]: hsk,
    ...overrides,
  };
  return vi.fn((url: string) => {
    const name = Object.keys(all).find((file) => url.endsWith(file));
    const content = name === undefined ? undefined : all[name];
    return content === undefined
      ? Promise.reject(new Error(`No file ${url}`))
      : Promise.resolve(typeof content === 'string' ? content : JSON.stringify(content));
  });
}

function word(term: string): Card {
  return {
    id: term,
    language: 'zh',
    term,
    translation: term,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('loading the sentence data', () => {
  it('reads the three files of the app itself, under its base path', async () => {
    const fetchText = files();

    const loaded = await createSentenceLoader(fetchText, '/vocab-learner/')();

    expect(fetchText).toHaveBeenCalledWith('/vocab-learner/data/sentences-zh.json');
    expect(fetchText).toHaveBeenCalledWith('/vocab-learner/data/measure-words.json');
    expect(fetchText).toHaveBeenCalledWith('/vocab-learner/data/hsk-words.json');
    expect(loaded.bank.sentences).toHaveLength(2);
    expect(loaded.measureWords.get('朋友')).toEqual(['个', '位']);
    expect(loaded.hsk.get('政府')).toEqual({ level: 5, pos: ['n'] });
  });

  it('loads them once, then shares them', async () => {
    const fetchText = files();
    const load = createSentenceLoader(fetchText, '/');

    await load();
    await load();

    expect(fetchText).toHaveBeenCalledTimes(3);
  });

  it('refuses a damaged or unexpected file, and tries again on the next call', async () => {
    const fetchText = files({ [SENTENCE_FILES.bank]: '{"format":"other"}' });
    const load = createSentenceLoader(fetchText, '/');

    await expect(load()).rejects.toThrow('sentences-zh.json');
    await expect(load()).rejects.toThrow();
    expect(fetchText).toHaveBeenCalledTimes(6);
  });

  it('refuses a file that is not JSON', async () => {
    const load = createSentenceLoader(files({ [SENTENCE_FILES.hsk]: '<html>' }), '/');

    await expect(load()).rejects.toThrow('hsk-words.json');
  });

  it('refuses a file too large to be ours before reading it', async () => {
    const huge = 'x'.repeat(MAX_SENTENCE_FILE_CHARACTERS + 1);
    const load = createSentenceLoader(files({ [SENTENCE_FILES.measureWords]: huge }), '/');

    await expect(load()).rejects.toThrow('measure-words.json');
  });
});

describe('the bank sentences of the learner', () => {
  it('know the HSK 1 to 3 words and the words of the learner', async () => {
    const loaded = await createSentenceLoader(files(), '/')();

    expect(bankLookupFor(loaded, [word('朋友')])(word('朋友')).map(({ id }) => id)).toEqual([1]);
    expect(bankLookupFor(loaded, [word('朋友')])(word('政府')).map(({ id }) => id)).toEqual([3]);
  });
});

describe('reading a file of the app', () => {
  it('asks the app itself for it, credentials of the same origin only', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{"a":1}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAppText('/vocab-learner/data/hsk-words.json')).resolves.toBe('{"a":1}');
    expect(fetchMock).toHaveBeenCalledWith('/vocab-learner/data/hsk-words.json', {
      credentials: 'same-origin',
    });
    vi.unstubAllGlobals();
  });

  it('fails on an HTTP error', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));

    await expect(fetchAppText('/missing.json')).rejects.toThrow('404');
    vi.unstubAllGlobals();
  });
});

describe('looking up the bank sentences of a word twice', () => {
  it('gives the same sentences without searching again', async () => {
    const loaded = await createSentenceLoader(files(), '/')();
    const lookup = bankLookupFor(loaded, []);

    expect(lookup(word('朋友'))).toBe(lookup(word('朋友')));
  });
});
