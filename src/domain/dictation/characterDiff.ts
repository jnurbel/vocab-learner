/** One character of the comparison between the expected word and the learner's answer. */
export type DiffPart =
  | { kind: 'correct'; given: string; expected: string }
  | { kind: 'wrong'; given: string; expected: string }
  | { kind: 'missing'; expected: string }
  | { kind: 'extra'; given: string };

/**
 * Edit distances (Levenshtein) between every prefix of `expected` and of `given`, over code
 * points so that a rare hanzi outside the basic plane counts as one character.
 */
class DistanceTable {
  private readonly cells: Uint32Array;
  private readonly width: number;

  constructor(
    readonly expected: readonly string[],
    readonly given: readonly string[],
  ) {
    this.width = given.length + 1;
    this.cells = new Uint32Array((expected.length + 1) * this.width);
    for (let row = 0; row <= expected.length; row++) {
      for (let column = 0; column <= given.length; column++) {
        this.cells[row * this.width + column] = this.computed(row, column);
      }
    }
  }

  cost(row: number, column: number): number {
    // Every cell is filled by the constructor, so the read is always a number.
    return Number(this.cells[row * this.width + column]);
  }

  get distance(): number {
    return this.cost(this.expected.length, this.given.length);
  }

  private computed(row: number, column: number): number {
    if (row === 0 || column === 0) {
      return row + column;
    }
    const substitution = this.expected[row - 1] === this.given[column - 1] ? 0 : 1;
    return Math.min(
      this.cost(row - 1, column - 1) + substitution,
      this.cost(row - 1, column) + 1,
      this.cost(row, column - 1) + 1,
    );
  }
}

/** Number of characters to insert, delete or replace to turn `given` into `expected`. */
export function editDistance(expected: string, given: string): number {
  return new DistanceTable(Array.from(expected), Array.from(given)).distance;
}

/** The character before `position`, empty at the start. */
function charBefore(chars: readonly string[], position: number): string {
  return chars.slice(Math.max(position - 1, 0), position).join('');
}

/** Aligns the answer on the expected word with the fewest edits, character by character. */
export function characterDiff(expected: string, given: string): DiffPart[] {
  const expectedChars = Array.from(expected);
  const givenChars = Array.from(given);
  const table = new DistanceTable(expectedChars, givenChars);
  const parts: DiffPart[] = [];
  let row = expectedChars.length;
  let column = givenChars.length;
  // Walks back from the end; on a tie, a match or a substitution reads better than a gap.
  while (row > 0 || column > 0) {
    const here = table.cost(row, column);
    const wanted = charBefore(expectedChars, row);
    const typed = charBefore(givenChars, column);
    const diagonal = row > 0 && column > 0 ? table.cost(row - 1, column - 1) : Infinity;
    if (wanted === typed && here === diagonal) {
      parts.push({ kind: 'correct', given: typed, expected: wanted });
      row -= 1;
      column -= 1;
    } else if (here === diagonal + 1) {
      parts.push({ kind: 'wrong', given: typed, expected: wanted });
      row -= 1;
      column -= 1;
    } else if (row > 0 && here === table.cost(row - 1, column) + 1) {
      parts.push({ kind: 'missing', expected: wanted });
      row -= 1;
    } else {
      parts.push({ kind: 'extra', given: typed });
      column -= 1;
    }
  }
  return parts.reverse();
}
