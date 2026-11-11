import type { Language } from '../card';

/** A word as cut by the segmenter, before it is counted. */
export interface FoundWord {
  language: Language;
  term: string;
  capitalized: boolean;
}

/**
 * A correction of the learner to a badly cut word: join it with the word that follows it, or cut
 * it in two before the character at index `at` (in code points). It applies to the whole text.
 */
export type SegmentAdjustment =
  { kind: 'join'; first: string; second: string } | { kind: 'split'; term: string; at: number };

/** Words written one after the other, without punctuation between them. */
export type WordRun = FoundWord[];

function joined(first: FoundWord, second: FoundWord): FoundWord {
  const separator = first.language === 'en' ? ' ' : '';
  return { ...first, term: `${first.term}${separator}${second.term}` };
}

function join(run: WordRun, first: string, second: string): WordRun {
  const result: WordRun = [];
  for (const word of run) {
    const previous = result.at(-1);
    if (previous?.term === first && word.term === second && previous.language === word.language) {
      result[result.length - 1] = joined(previous, word);
    } else {
      result.push(word);
    }
  }
  return result;
}

function split(run: WordRun, term: string, at: number): WordRun {
  const characters = Array.from(term);
  if (at <= 0 || at >= characters.length) {
    return run;
  }
  const pieces = [characters.slice(0, at).join(''), characters.slice(at).join('')];
  return run.flatMap((word) =>
    word.term === term ? pieces.map((piece) => ({ ...word, term: piece })) : [word],
  );
}

/** Applies the learner's corrections, in the order they were made, to a run of words. */
export function adjustRun(run: WordRun, adjustments: readonly SegmentAdjustment[]): WordRun {
  return adjustments.reduce(
    (current, adjustment) =>
      adjustment.kind === 'join'
        ? join(current, adjustment.first, adjustment.second)
        : split(current, adjustment.term, adjustment.at),
    run,
  );
}
