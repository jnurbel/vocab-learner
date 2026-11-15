import { z } from 'zod';
import { failure, success, type Result } from '../result';
import { singleLine } from '../safeText';

/**
 * The sentence data of public/data/ (DESIGN.md 5 ter), produced by scripts/sentences/. It is
 * fetched at run time, so it is untrusted input: every file is validated and bounded here, so
 * that a damaged or hostile file can neither inject markup nor exhaust memory.
 */
export const SENTENCE_DATA_LIMITS = {
  sentences: 40_000,
  authors: 20_000,
  authorLength: 100,
  /** Code points of a sentence; the bank keeps 20, the margin tolerates a newer script. */
  sentenceLength: 40,
  wordLength: 20,
  translationLength: 300,
  nouns: 10_000,
  measureWordsPerNoun: 8,
  hskWords: 12_000,
} as const;

export type TranslationLanguage = 'fr' | 'en';

/** A sentence of the bank, with what its attribution needs (CC BY 2.0 FR). */
export interface BankSentence {
  /** Its Tatoeba number. */
  id: number;
  author: string;
  /** Its words as cut when the bank was built, punctuation included. */
  words: readonly string[];
  text: string;
  translation: {
    lang: TranslationLanguage;
    id: number;
    author: string;
    text: string;
  };
  /** Converted from traditional characters. */
  t2s: boolean;
  /** Also available under CC0 1.0. */
  cc0: boolean;
}

export interface SentenceBank {
  sentences: readonly BankSentence[];
}

export interface HskWord {
  level: number;
  /** Part-of-speech tags such as n, v, a. */
  pos: readonly string[];
}

export interface DataIssue {
  path: string;
  code: string;
}

/** Free text describing the file (source, licence): read by people, ignored by the app. */
const metaSchema = z.record(z.string().max(40), z.string().max(2_000)).optional();
const tatoebaId = z
  .number()
  .int()
  .positive()
  .max(2 ** 31);
const HIDDEN_CONTROLS = /[\p{Cc}\p{Bidi_Control}]/u;
const word = z
  .string()
  .min(1)
  .max(SENTENCE_DATA_LIMITS.wordLength)
  .refine((text) => !/\s/u.test(text) && !HIDDEN_CONTROLS.test(text));
const chineseWord = z.string().regex(/^\p{Script=Han}{1,8}$/u);
const measureWord = z.string().regex(/^\p{Script=Han}{1,2}$/u);

const sentenceSchema = z.union([
  z.tuple([
    tatoebaId,
    z.number().int().nonnegative(),
    z.string().max(SENTENCE_DATA_LIMITS.sentenceLength * 2),
    z.enum(['fr', 'en']),
    tatoebaId,
    z.number().int().nonnegative(),
    singleLine(SENTENCE_DATA_LIMITS.translationLength),
  ]),
  z.tuple([
    tatoebaId,
    z.number().int().nonnegative(),
    z.string().max(SENTENCE_DATA_LIMITS.sentenceLength * 2),
    z.enum(['fr', 'en']),
    tatoebaId,
    z.number().int().nonnegative(),
    singleLine(SENTENCE_DATA_LIMITS.translationLength),
    z.strictObject({ t2s: z.literal(true).optional(), license: z.literal('CC0-1.0').optional() }),
  ]),
]);

const bankSchema = z.strictObject({
  _meta: metaSchema,
  format: z.literal('vocab-learner-sentences'),
  version: z.literal(1),
  authors: z
    .array(singleLine(SENTENCE_DATA_LIMITS.authorLength))
    .min(1)
    .max(SENTENCE_DATA_LIMITS.authors),
  sentences: z.array(sentenceSchema).max(SENTENCE_DATA_LIMITS.sentences),
});

const measureWordsSchema = z.strictObject({
  _meta: metaSchema,
  format: z.literal('vocab-learner-measure-words'),
  version: z.literal(1),
  nouns: z
    .record(chineseWord, z.array(measureWord).min(1).max(SENTENCE_DATA_LIMITS.measureWordsPerNoun))
    .refine((nouns) => Object.keys(nouns).length <= SENTENCE_DATA_LIMITS.nouns),
});

const hskWordsSchema = z.strictObject({
  _meta: metaSchema,
  format: z.literal('vocab-learner-hsk-words'),
  version: z.literal(1),
  words: z
    .record(
      chineseWord,
      z.tuple([z.number().int().min(1).max(6), z.string().regex(/^[A-Za-z ]{0,40}$/)]),
    )
    .refine((words) => Object.keys(words).length <= SENTENCE_DATA_LIMITS.hskWords),
});

function issuesOf(error: z.ZodError): DataIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code }));
}

/** Validates the sentence bank (Tatoeba). Never throws. */
export function parseSentenceBank(json: unknown): Result<SentenceBank, DataIssue> {
  const parsed = bankSchema.safeParse(json);
  if (!parsed.success) {
    return failure(issuesOf(parsed.error));
  }
  const { authors } = parsed.data;
  const issues: DataIssue[] = [];
  const sentences: BankSentence[] = [];
  parsed.data.sentences.forEach((entry, index) => {
    const [id, authorIndex, cut, lang, translationId, translationAuthorIndex, translation] = entry;
    const flags = entry[7] ?? {};
    const author = authors[authorIndex];
    const translationAuthor = authors[translationAuthorIndex];
    const words = cut.split(' ');
    const text = words.join('');
    if (
      author === undefined ||
      translationAuthor === undefined ||
      !words.every((piece) => word.safeParse(piece).success) ||
      Array.from(text).length > SENTENCE_DATA_LIMITS.sentenceLength
    ) {
      issues.push({ path: `sentences.${String(index)}`, code: 'invalidSentence' });
      return;
    }
    sentences.push({
      id,
      author,
      words,
      text,
      translation: { lang, id: translationId, author: translationAuthor, text: translation },
      t2s: flags.t2s === true,
      cc0: flags.license === 'CC0-1.0',
    });
  });
  return issues.length > 0 ? failure(issues) : success({ sentences });
}

/** Validates the measure words of the nouns (adapted from CC-CEDICT). Never throws. */
export function parseMeasureWords(
  json: unknown,
): Result<ReadonlyMap<string, readonly string[]>, DataIssue> {
  const parsed = measureWordsSchema.safeParse(json);
  return parsed.success
    ? success(new Map(Object.entries(parsed.data.nouns)))
    : failure(issuesOf(parsed.error));
}

/** Validates the HSK words with their level and parts of speech. Never throws. */
export function parseHskWords(json: unknown): Result<ReadonlyMap<string, HskWord>, DataIssue> {
  const parsed = hskWordsSchema.safeParse(json);
  if (!parsed.success) {
    return failure(issuesOf(parsed.error));
  }
  return success(
    new Map(
      Object.entries(parsed.data.words).map(([hanzi, [level, pos]]) => [
        hanzi,
        { level, pos: pos.split(' ').filter((tag) => tag !== '') },
      ]),
    ),
  );
}
