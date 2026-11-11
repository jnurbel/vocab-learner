import { describe, expect, it } from 'vitest';
import { BYTE_ORDER_MARK, neutralizeFormula, parseCsv, restoreFormula, toCsv } from './csv';

describe('parseCsv', () => {
  it('reads rows separated by semicolons, as Excel writes them in French', () => {
    expect(parseCsv('a;b;c\nd;e;f')).toEqual({
      ok: true,
      value: [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ],
    });
  });

  it('reads rows separated by commas when the first line has no semicolon', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual({
      ok: true,
      value: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    });
  });

  it('reads rows separated by tabs, as copied from a spreadsheet', () => {
    expect(parseCsv('a\tb\nc\td')).toEqual({
      ok: true,
      value: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    });
  });

  it('reads a file of a single column', () => {
    expect(parseCsv('a\nb')).toEqual({ ok: true, value: [['a'], ['b']] });
  });

  it('ignores the byte order mark and blank lines', () => {
    expect(parseCsv(`${BYTE_ORDER_MARK}a;b\n\n\nc;d\n`)).toEqual({
      ok: true,
      value: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    });
  });

  it('reads quoted cells holding separators, doubled quotes and line breaks', () => {
    expect(parseCsv('"a;1";"say ""hi""";"two\nlines"\nb;c;d')).toEqual({
      ok: true,
      value: [
        ['a;1', 'say "hi"', 'two\nlines'],
        ['b', 'c', 'd'],
      ],
    });
  });

  it('keeps an empty cell', () => {
    expect(parseCsv('a;;c')).toEqual({ ok: true, value: [['a', '', 'c']] });
  });

  it('reports a quote never closed', () => {
    expect(parseCsv('a;"b\nc;d')).toEqual({ ok: false, errors: ['unclosedQuote'] });
  });

  it('reports a quote followed by text inside the same cell', () => {
    expect(parseCsv('"a"b;c')).toEqual({ ok: false, errors: ['misplacedQuote'] });
  });
});

describe('toCsv', () => {
  it('writes rows with semicolons and CRLF line ends, quoting only what needs it', () => {
    expect(
      toCsv([
        ['a', 'b;c', 'say "hi"'],
        ['two\nlines', '', 'plain'],
      ]),
    ).toBe('a;"b;c";"say ""hi"""\r\n"two\nlines";;plain\r\n');
  });

  it('reads back exactly what it wrote', () => {
    const rows = [
      ['猫', 'māo', 'chat, félin', '"quoted"; and\r\nmore'],
      ['', 'x', 'y', 'z'],
    ];

    expect(parseCsv(toCsv(rows))).toEqual({ ok: true, value: rows });
  });
});

describe('formula injection (OWASP CSV injection)', () => {
  it.each(['=SUM(A1:A2)', '+33 6', '-2+3', '@cmd', '\t=1', '\r=1'])(
    'prefixes a cell starting like a formula with a quote: %s',
    (cell) => {
      expect(neutralizeFormula(cell)).toBe(`'${cell}`);
    },
  );

  it('leaves an ordinary cell as it is', () => {
    expect(neutralizeFormula('bonjour = hello')).toBe('bonjour = hello');
  });

  it('takes the prefix away when reading the file back', () => {
    expect(restoreFormula("'=SUM(A1:A2)")).toBe('=SUM(A1:A2)');
    expect(restoreFormula("'-ment")).toBe('-ment');
  });

  it('keeps an apostrophe that does not protect a formula', () => {
    expect(restoreFormula("'tis")).toBe("'tis");
  });
});
