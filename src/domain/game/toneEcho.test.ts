import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { createRng } from '../srs/random';
import { ENGLISH_MINIMAL_PAIRS } from './englishMinimalPairs';
import {
  chinesePairItems,
  contourPath,
  pickToneEchoQuestion,
  questionCard,
  questionKey,
  toneContour,
  toneEchoAnswer,
  toneEchoEligibleCount,
  toneEchoPool,
  type ToneEchoQuestion,
  englishPairItems,
  normalizeTonePattern,
  spokenTonePattern,
  toneSyllableItems,
  tonePatternItem,
  wordSyllables,
} from './toneEcho';

function word(term: string, pinyin: string, overrides: Partial<Card> = {}): Card {
  return {
    id: term,
    language: 'zh',
    term,
    pinyin,
    translation: `meaning of ${term}`,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('wordSyllables', () => {
  it('pairs each character with its syllable and tone', () => {
    expect(wordSyllables(word('时间', 'shíjiān'))).toEqual([
      { char: '时', syllable: 'shí', tone: 2 },
      { char: '间', syllable: 'jiān', tone: 1 },
    ]);
  });

  it('gives nothing when the pinyin does not match the characters one by one', () => {
    expect(wordSyllables(word('时间', 'shí'))).toEqual([]);
    expect(wordSyllables(word('时间', ''))).toEqual([]);
    expect(wordSyllables(word('时间', '', { pinyin: undefined }))).toEqual([]);
    expect(wordSyllables(word('ship', 'ship', { language: 'en' }))).toEqual([]);
  });
});

describe('toneSyllableItems (level 1)', () => {
  it('offers each toned syllable of the words, read alone through its character', () => {
    expect(toneSyllableItems([word('时间', 'shí jiān')])).toEqual([
      expect.objectContaining({ kind: 'tone', char: '时', syllable: 'shí', tone: 2 }),
      expect.objectContaining({ kind: 'tone', char: '间', syllable: 'jiān', tone: 1 }),
    ]);
  });

  it('leaves out 一 and 不, neutral tones, and characters read differently alone', () => {
    const items = toneSyllableItems([
      word('一天', 'yītiān'),
      word('不好', 'bùhǎo'),
      word('桌子', 'zhuōzi'),
      word('好了', 'hǎole'),
    ]);

    expect(items.map(({ char }) => char)).toEqual(['天', '桌']);
  });
});

describe('tonePatternItem (level 2)', () => {
  it('expects the citation tones of a two-syllable word, the neutral tone as 5', () => {
    expect(tonePatternItem(word('时间', 'shíjiān'))).toMatchObject({
      kind: 'pattern',
      pattern: '21',
    });
    expect(tonePatternItem(word('桌子', 'zhuōzi'))?.pattern).toBe('15');
  });

  it('expects 33 for 你好, though it is heard 23', () => {
    expect(tonePatternItem(word('你好', 'nǐhǎo'))?.pattern).toBe('33');
    expect(spokenTonePattern('33')).toBe('23');
    expect(spokenTonePattern('34')).toBe('34');
  });

  it('asks no word with 一 or 不, nor of another length', () => {
    expect(tonePatternItem(word('一起', 'yìqǐ'))).toBeUndefined();
    expect(tonePatternItem(word('不对', 'búduì'))).toBeUndefined();
    expect(tonePatternItem(word('猫', 'māo'))).toBeUndefined();
    expect(tonePatternItem(word('图书馆', 'túshūguǎn'))).toBeUndefined();
  });
});

describe('normalizeTonePattern', () => {
  it('reads 0 as the neutral tone and ignores spaces', () => {
    expect(normalizeTonePattern(' 1 0 ')).toBe('15');
  });

  it('keeps only tone digits, at most two, from an untrusted input', () => {
    expect(normalizeTonePattern('3<script>4')).toBe('34');
    expect(normalizeTonePattern('123456')).toBe('12');
    expect(normalizeTonePattern('')).toBe('');
  });
});

describe('chinesePairItems (level 3)', () => {
  it('pairs two words of the learner with the same syllables but other tones', () => {
    const time = word('时间', 'shíjiān');
    const event = word('事件', 'shì jiàn');

    expect(chinesePairItems([time, event, word('猫', 'māo')])).toEqual([
      {
        kind: 'pair',
        level: 3,
        sides: [
          { text: '时间', display: 'shíjiān', language: 'zh', card: time },
          { text: '事件', display: 'shì jiàn', language: 'zh', card: event },
        ],
      },
    ]);
  });

  it('never pairs exact homophones, nor a word with itself', () => {
    expect(chinesePairItems([word('是', 'shì'), word('事', 'shì')])).toEqual([]);
    expect(chinesePairItems([word('猫', 'māo')])).toEqual([]);
    expect(chinesePairItems([word('猫', ''), word('毛', '')])).toEqual([]);
    expect(chinesePairItems([word('猫', 'māo', { pinyin: undefined }), word('毛', 'máo')])).toEqual(
      [],
    );
  });
});

describe('English minimal pairs', () => {
  it('are our own list of distinct words, graded from clear contrasts to hard ones', () => {
    const words = ENGLISH_MINIMAL_PAIRS.flatMap(({ words: pair }) => pair);
    expect(new Set(words).size).toBe(words.length);
    expect(new Set(ENGLISH_MINIMAL_PAIRS.map(({ level }) => level))).toEqual(new Set([1, 2, 3]));
    expect(ENGLISH_MINIMAL_PAIRS).toContainEqual({ words: ['ship', 'sheep'], level: 3 });
  });

  it('link a pair to the words of the learner found in it, whatever their case', () => {
    const sheep = word('Sheep', '', { language: 'en', pinyin: undefined });

    const items = englishPairItems([sheep]);

    const linked = items.find(({ sides }) => sides[1].text === 'sheep');
    expect(linked?.sides).toEqual([
      { text: 'ship', display: 'ship', language: 'en' },
      { text: 'sheep', display: 'sheep', language: 'en', card: sheep },
    ]);
    expect(items).toHaveLength(ENGLISH_MINIMAL_PAIRS.length);
  });
});

describe('toneEchoPool and pickToneEchoQuestion', () => {
  const time = word('时间', 'shíjiān');
  const event = word('事件', 'shìjiàn');
  const cat = word('猫', 'māo');
  const rng = () => createRng('seed');

  it('asks a minimal pair at level 3, a tone pattern at level 2, a tone at level 1', () => {
    const pool = toneEchoPool([time, event, cat], 'zh');

    expect(pickToneEchoQuestion(pool, 3, rng(), new Set())?.kind).toBe('pair');
    expect(pickToneEchoQuestion(pool, 2, rng(), new Set())?.kind).toBe('pattern');
    expect(pickToneEchoQuestion(pool, 1, rng(), new Set())?.kind).toBe('tone');
  });

  it('skips level 3 without a pair of the learner, and level 2 without a word of two syllables', () => {
    expect(pickToneEchoQuestion(toneEchoPool([time], 'zh'), 3, rng(), new Set())?.kind).toBe(
      'pattern',
    );
    expect(pickToneEchoQuestion(toneEchoPool([cat], 'zh'), 3, rng(), new Set())?.kind).toBe('tone');
    expect(pickToneEchoQuestion(toneEchoPool([], 'zh'), 1, rng(), new Set())).toBeUndefined();
  });

  it('asks another item before asking one again', () => {
    const pool = toneEchoPool([cat, word('狗', 'gǒu')], 'zh');
    const first = pickToneEchoQuestion(pool, 1, rng(), new Set());
    const asked = new Set([first?.kind === 'tone' ? first.char : '']);

    const second = pickToneEchoQuestion(pool, 1, rng(), asked);

    expect(second?.kind === 'tone' && second.char).not.toBe(first?.kind === 'tone' && first.char);
  });

  it('asks English pairs holding a word of the learner first, then pairs of the level', () => {
    const sheep = word('sheep', '', { language: 'en' });
    const pool = toneEchoPool([sheep], 'en');

    const question = pickToneEchoQuestion(pool, 3, rng(), new Set());

    expect(question?.kind === 'pair' && question.sides.map(({ text }) => text)).toEqual([
      'ship',
      'sheep',
    ]);
    expect(pickToneEchoQuestion(pool, 1, rng(), new Set())).toMatchObject({ level: 3 });
    expect(pickToneEchoQuestion(toneEchoPool([], 'en'), 1, rng(), new Set())).toMatchObject({
      level: 1,
    });
  });

  it('keeps the items of the imposed words only', () => {
    const pool = toneEchoPool([time, event, cat], 'zh', ['猫']);

    expect(pool.patterns).toEqual([]);
    expect(pool.pairs).toEqual([]);
    expect(pool.tones.map(({ char }) => char)).toEqual(['猫']);
    expect(toneEchoPool([time, event, cat], 'zh', ['事件']).pairs).toHaveLength(1);
  });

  it('keeps the English pairs of the imposed words only', () => {
    const sheep = word('sheep', '', { language: 'en' });
    const table = word('table', '', { language: 'en' });

    expect(toneEchoPool([sheep, table], 'en', ['sheep']).pairs).toHaveLength(1);
    expect(toneEchoPool([sheep, table], 'en', ['table']).pairs).toEqual([]);
  });

  it('asks an item again once every item was asked, either side of a pair being heard', () => {
    const pool = toneEchoPool([time, event], 'zh');
    const all = new Set([...pool.pairs.map(questionKey)]);

    const low = pickToneEchoQuestion(pool, 3, () => 0.1, all);
    const high = pickToneEchoQuestion(pool, 3, () => 0.9, all);

    expect(low?.kind === 'pair' && low.heard).toBe(0);
    expect(high?.kind === 'pair' && high.heard).toBe(1);
  });
});

describe('toneEchoAnswer', () => {
  const tone: ToneEchoQuestion = {
    kind: 'tone',
    card: word('猫', 'māo'),
    char: '猫',
    syllable: 'māo',
    tone: 1,
  };

  it('is right for the tone heard, wrong for another one or the neutral tone', () => {
    expect(toneEchoAnswer(tone, 1)).toBe('correct');
    expect(toneEchoAnswer(tone, 4)).toBe('wrong');
    expect(toneEchoAnswer(tone, 5)).toBe('wrong');
  });

  it('compares a typed pattern once cleaned, 0 being the neutral tone', () => {
    const pattern = tonePatternItem(word('桌子', 'zhuōzi'));
    if (pattern === undefined) {
      throw new Error('No pattern');
    }

    expect(toneEchoAnswer(pattern, '1 0')).toBe('correct');
    expect(toneEchoAnswer(pattern, '11')).toBe('wrong');
  });

  it('is right for the side of the pair heard', () => {
    const [pair] = chinesePairItems([word('时间', 'shíjiān'), word('事件', 'shìjiàn')]);
    if (pair === undefined) {
      throw new Error('No pair');
    }
    const heard: ToneEchoQuestion = { ...pair, heard: 1 };

    expect(toneEchoAnswer(heard, 1)).toBe('correct');
    expect(toneEchoAnswer(heard, 0)).toBe('wrong');
    expect(questionCard(heard)?.term).toBe('事件');
  });
});

describe('questionCard', () => {
  it('is the word asked, or the learner word of a pair, or none for a pair of the list only', () => {
    const sheep = word('sheep', '', { language: 'en' });
    const [linked] = toneEchoPool([sheep], 'en').pairs.filter(({ sides }) =>
      sides.some(({ card }) => card !== undefined),
    );
    const [unlinked] = toneEchoPool([], 'en').pairs;
    if (linked === undefined || unlinked === undefined) {
      throw new Error('No pairs');
    }

    expect(questionCard({ ...linked, heard: 0 })).toBe(sheep);
    expect(questionCard({ ...unlinked, heard: 0 })).toBeUndefined();
    expect(questionCard(tonePatternItem(word('时间', 'shíjiān')) as ToneEchoQuestion)?.term).toBe(
      '时间',
    );
  });
});

describe('toneEchoEligibleCount', () => {
  it('counts the Chinese words with a tone to hear, and the English words of a pair', () => {
    const cards = [
      word('时间', 'shíjiān'),
      word('一', 'yī'),
      word('sheep', '', { language: 'en' }),
      word('table', '', { language: 'en' }),
    ];

    expect(toneEchoEligibleCount(cards, 'zh')).toBe(1);
    expect(toneEchoEligibleCount(cards, 'en')).toBe(1);
  });
});

describe('toneContour', () => {
  it('follows the five pitch levels of each tone (Chao numbers)', () => {
    expect(toneContour(1)).toEqual([5, 5]);
    expect(toneContour(2)).toEqual([3, 5]);
    expect(toneContour(3)).toEqual([2, 1, 4]);
    expect(toneContour(4)).toEqual([5, 1]);
    expect(toneContour('neutral')).toEqual([3]);
  });

  it('draws a curve in a box, level 5 at the top, level 1 at the bottom', () => {
    const box = { width: 88, height: 52, margin: 6 };

    expect(contourPath(1, box)).toBe('M12 6 L76 6');
    expect(contourPath(4, box)).toBe('M12 6 L76 46');
    expect(contourPath(3, box)).toBe('M12 36 L44 46 L76 16');
    expect(contourPath('neutral', box)).toBe('M44 26 L44 26');
  });
});
