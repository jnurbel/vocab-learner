const WHITESPACE = /\s+/gu;
/** Right single quote, left single quote, modifier apostrophe, backtick, acute accent, prime. */
const APOSTROPHES = /[’‘ʼ`´′]/g;
/** "to run" and "run" are the same answer: the infinitive marker is optional. */
const INFINITIVE_MARKER = /^to (?=\S)/;

/** British spellings that no rule below can derive, with their American form. */
const SPELLING_PAIRS: ReadonlyMap<string, string> = new Map([
  ['grey', 'gray'],
  ['jewellery', 'jewelry'],
  ['programme', 'program'],
  ['programmes', 'programs'],
  ['practise', 'practice'],
  ['practised', 'practiced'],
  ['practising', 'practicing'],
  ['aluminium', 'aluminum'],
  ['plough', 'plow'],
  ['mould', 'mold'],
  ['pyjamas', 'pajamas'],
  ['defence', 'defense'],
  ['offence', 'offense'],
  ['licence', 'license'],
  ['catalogue', 'catalog'],
  ['dialogue', 'dialog'],
  ['analogue', 'analog'],
  ['ageing', 'aging'],
  ['doughnut', 'donut'],
  ['sceptical', 'skeptical'],
  ['fulfil', 'fulfill'],
  ['enrol', 'enroll'],
  ['skilful', 'skillful'],
  ['axe', 'ax'],
  ['manoeuvre', 'maneuver'],
  ['mum', 'mom'],
]);

/**
 * A spelling rule: words matching `pattern` are rewritten to their American form, unless the
 * word built from the stem and `base` is a known exception (a word spelt alike on both sides).
 */
interface SpellingRule {
  pattern: RegExp;
  replacement: string;
  base: string;
  exceptions: ReadonlySet<string>;
}

const SPELLING_RULES: readonly SpellingRule[] = [
  {
    // colour/color, favourite/favorite; "four" or "hour" are too short to match.
    pattern: /^(.{3,})our(s|ed|ing|ite|ites|able|ably|less|ful|hood)?$/,
    replacement: '$1or$2',
    base: 'our',
    exceptions: new Set(['detour', 'contour', 'devour', 'velour', 'paramour', 'troubadour']),
  },
  {
    // realise/realize, organisation/organization; "wise" or "rise" are too short to match.
    pattern: /^(.{3,})is(e|ed|es|ing|ation|ations|er|ers)$/,
    replacement: '$1iz$2',
    base: 'ise',
    exceptions: new Set([
      'advise',
      'advertise',
      'anise',
      'arise',
      'bruise',
      'chemise',
      'circumcise',
      'comprise',
      'compromise',
      'concise',
      'cruise',
      'demise',
      'despise',
      'devise',
      'disguise',
      'enterprise',
      'excise',
      'exercise',
      'expertise',
      'franchise',
      'improvise',
      'incise',
      'merchandise',
      'mortise',
      'noise',
      'otherwise',
      'paradise',
      'poise',
      'praise',
      'precise',
      'premise',
      'promise',
      'raise',
      'reprise',
      'revise',
      'supervise',
      'surprise',
      'televise',
      'treatise',
    ]),
  },
  {
    // analyse/analyze, paralyse/paralyze.
    pattern: /^(.{2,})ys(e|ed|es|ing)$/,
    replacement: '$1yz$2',
    base: 'yse',
    exceptions: new Set(),
  },
  {
    // centre/center, theatre/theater, fibre/fiber; not "genre", "acre" or "ogre".
    pattern: /^(.{2,}[tbgv])re(s)?$/,
    replacement: '$1er$2',
    base: 're',
    exceptions: new Set(),
  },
  {
    // travelled/traveled, cancelling/canceling; not "yelled" nor verbs stressed on "-el".
    pattern: /^(.{3,})ell(ed|ing|er|ers|or|ors|ery)$/,
    replacement: '$1el$2',
    base: 'el',
    exceptions: new Set([
      'compel',
      'dispel',
      'excel',
      'expel',
      'impel',
      'propel',
      'rebel',
      'repel',
    ]),
  },
];

/** Lower case, single spaces, plain apostrophes: how an English answer is compared. */
export function normalizeEnglish(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(WHITESPACE, ' ')
    .trim();
}

/** The form two spellings of the same answer share. `text` must be normalized. */
export function canonicalEnglish(text: string): string {
  return text.replace(INFINITIVE_MARKER, '').split(' ').map(americanSpelling).join(' ');
}

function americanSpelling(word: string): string {
  const paired = SPELLING_PAIRS.get(word);
  if (paired !== undefined) {
    return paired;
  }
  for (const { pattern, replacement, base, exceptions } of SPELLING_RULES) {
    const match = pattern.exec(word);
    if (match !== null) {
      // Every pattern captures the stem as its first group.
      const stem = String(match[1]);
      return exceptions.has(stem + base) ? word : word.replace(pattern, replacement);
    }
  }
  return word;
}
