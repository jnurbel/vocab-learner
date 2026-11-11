import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { createRng } from '../srs/random';
import {
  glosses,
  isExcluded,
  meaningsConflict,
  pickDistractors,
  similarity,
  type DistractorPool,
} from './distractors';
import { MINI_GAME_CONFIG } from './miniGameConfig';

function zh(
  id: string,
  term: string,
  pinyin: string,
  translation: string,
  labelIds: string[] = [],
) {
  return word(id, { term, pinyin, translation, labelIds });
}

function en(id: string, term: string, translation: string, labelIds: string[] = []) {
  return word(id, { language: 'en', term, translation, labelIds });
}

function word(id: string, overrides: Partial<Card>): Card {
  return {
    id,
    language: 'zh',
    term: id,
    translation: id,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const shijian = zh('shijian', '时间', 'shíjiān', 'temps');
const shijian2 = zh('shijian2', '事件', 'shìjiàn', 'événement');
const shiji = zh('shiji', '实际', 'shíjì', 'en fait');
const mao = zh('mao', '猫', 'māo', 'chat');
const gou = zh('gou', '狗', 'gǒu', 'chien');
const tianqi = zh('tianqi', '天气', 'tiānqì', 'météo');
const shi = zh('shi', '是', 'shì', 'être');
const shi2 = zh('shi2', '事', 'shì', 'affaire');

describe('the glosses of a meaning (GAME_DESIGN.md 6.0)', () => {
  it('lowers the case, drops the accents, the parentheses and the leading articles', () => {
    expect(glosses("L'Été (saison) ; le temps / un moment, to wait")).toEqual([
      'ete',
      'temps',
      'moment',
      'wait',
    ]);
  });

  it.each([
    'la maison',
    'les maison',
    'une maison',
    'des maison',
    'du maison',
    'de la maison',
    'se maison',
    "s'maison",
    's’maison',
  ])('drops the leading article of "%s"', (meaning) => {
    expect(glosses(meaning)).toEqual(['maison']);
  });

  it('keeps nothing of an empty meaning', () => {
    expect(glosses(' ; ( ) ')).toEqual([]);
  });

  it('finds two meanings in conflict when they share a gloss', () => {
    expect(meaningsConflict('le temps, la durée', 'temps (météo)')).toBe(true);
    expect(meaningsConflict('chat', 'chien')).toBe(false);
  });

  it('never offers as a distractor a word sharing a sense written after a vertical bar', () => {
    expect(glosses('contrôler | contrôle')).toEqual(['controler', 'controle']);
    expect(meaningsConflict('contrôler | contrôle', 'le contrôle')).toBe(true);
  });
});

describe('the words that can never be distractors', () => {
  it('excludes the same term, a meaning in conflict and an exact Chinese homophone', () => {
    expect(isExcluded(shijian, zh('x', '时间', 'shíjiān', 'heure'), MINI_GAME_CONFIG)).toBe(true);
    expect(isExcluded(shijian, zh('y', '时候', 'shíhou', 'temps, moment'), MINI_GAME_CONFIG)).toBe(
      true,
    );
    expect(isExcluded(shi, shi2, MINI_GAME_CONFIG)).toBe(true);
    expect(isExcluded(shijian, shijian2, MINI_GAME_CONFIG)).toBe(false);
  });

  it('never takes two Chinese words without pinyin for homophones', () => {
    expect(
      isExcluded(zh('a', '猫', '', 'chat'), zh('b', '狗', '', 'chien'), MINI_GAME_CONFIG),
    ).toBe(false);
    expect(
      isExcluded(word('c', { term: '鸟', translation: 'oiseau' }), mao, MINI_GAME_CONFIG),
    ).toBe(false);
  });

  it('excludes an English homophone of the embedded list, whatever the case', () => {
    expect(isExcluded(en('two', 'two', 'deux'), en('too', 'Too', 'aussi'), MINI_GAME_CONFIG)).toBe(
      true,
    );
    expect(isExcluded(en('two', 'two', 'deux'), en('tea', 'tea', 'thé'), MINI_GAME_CONFIG)).toBe(
      false,
    );
  });
});

describe('the sound proximity of two words', () => {
  it('scores Chinese words by length, characters, toneless syllables, tones and sounds', () => {
    // Same length (1), same toneless syllables (2 x 2), same initials and finals (4 x 0.5).
    expect(similarity(shijian, shijian2, MINI_GAME_CONFIG)).toBe(1 + 4 + 2);
    // Same length (1), shi (2), sh + i + j (3 x 0.5); tones 2-1 against 2-4.
    expect(similarity(shijian, shiji, MINI_GAME_CONFIG)).toBe(1 + 2 + 1.5);
    // Same length only.
    expect(similarity(shijian, tianqi, MINI_GAME_CONFIG)).toBe(1);
  });

  it('counts at most 2 shared characters and a shared label', () => {
    const a = zh('a', '一二三', 'yī èr sān', 'a', ['l1']);
    const b = zh('b', '三二一', 'sān èr yī', 'b', ['l1']);

    // Length (1), 2 shared characters out of 3 (4), er (2), tones 1-4-1 (1), final er (0.5),
    // label (1.5); an empty initial is no shared sound.
    expect(similarity(a, b, MINI_GAME_CONFIG)).toBe(1 + 4 + 2 + 1 + 0.5 + 1.5);
  });

  it('scores a Chinese word without pinyin on its characters only', () => {
    const a = zh('a', '猫咪', '', 'a');
    const b = word('b', { term: '猫' });

    expect(similarity(a, b, MINI_GAME_CONFIG)).toBe(2);
  });

  it('scores English words by length, spelling distance, start and rhyme', () => {
    const weather = en('weather', 'weather', 'météo');
    // Length within 1 (1), distance 2 (3), rhyme "her" (1.5); "we" against "wh".
    expect(similarity(weather, en('whether', 'whether', 'si'), MINI_GAME_CONFIG)).toBe(5.5);
    // Length within 1 (1), distance 2 (3), rhyme "her" (1.5).
    expect(similarity(weather, en('father', 'father', 'père'), MINI_GAME_CONFIG)).toBe(5.5);
    // Distance 3 (1.5), same start "we" (1); 7 letters against 5.
    expect(similarity(weather, en('weave', 'weave', 'tisser'), MINI_GAME_CONFIG)).toBe(2.5);
    expect(similarity(weather, en('cat', 'cat', 'chat'), MINI_GAME_CONFIG)).toBe(0);
    expect(
      similarity(
        en('w', 'weather', 'météo', ['u4']),
        en('c', 'cat', 'chat', ['u4']),
        MINI_GAME_CONFIG,
      ),
    ).toBe(1.5);
  });
});

describe('picking the distractors', () => {
  const pool: DistractorPool = {
    cards: [shijian, shijian2, shiji, mao, gou, tianqi, shi, shi2],
    introduced: new Set(['shijian2', 'shiji', 'mao', 'gou', 'tianqi', 'shi', 'shi2']),
  };

  it('picks 2 distractors among the least similar half at level 1', () => {
    const picked = pickDistractors(shijian, pool, 1, createRng('seed'), MINI_GAME_CONFIG);

    expect(picked).toHaveLength(2);
    expect(picked?.every((card) => !['shijian2', 'shiji'].includes(card.id))).toBe(true);
  });

  it('picks 3 distractors with one among the 3 closest at level 2', () => {
    const picked = pickDistractors(shijian, pool, 2, createRng('seed'), MINI_GAME_CONFIG) ?? [];

    expect(picked).toHaveLength(3);
    const closest = ['shijian2', 'shiji', 'shi'];
    expect(picked.filter((card) => closest.includes(card.id)).length).toBeGreaterThanOrEqual(1);
  });

  it('picks 3 distractors among the 6 closest at level 3, never the least similar', () => {
    for (let seed = 0; seed < 30; seed++) {
      const picked =
        pickDistractors(shijian, pool, 3, createRng(String(seed)), MINI_GAME_CONFIG) ?? [];

      expect(picked).toHaveLength(3);
      // Sorted: shijian2, shiji, shi, shi2, tianqi, gou, then mao (ties by id).
      expect(picked.map(({ id }) => id)).not.toContain('mao');
    }
  });

  it('never picks the target, another language or an excluded word, whatever the seed', () => {
    const mixed: DistractorPool = {
      cards: [...pool.cards, en('time', 'time', 'temps'), zh('dup', '时间', 'shíjiān', 'heure')],
      introduced: new Set(),
    };
    for (let seed = 0; seed < 50; seed++) {
      const picked = pickDistractors(shijian, mixed, 3, createRng(String(seed)), MINI_GAME_CONFIG);
      const ids = (picked ?? []).map(({ id }) => id);
      expect(ids).not.toContain('shijian');
      expect(ids).not.toContain('time');
      expect(ids).not.toContain('dup');
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('prefers words already introduced, then falls back on every word', () => {
    const few: DistractorPool = { cards: pool.cards, introduced: new Set(['mao']) };

    const picked = pickDistractors(shijian, few, 1, createRng('seed'), MINI_GAME_CONFIG);

    expect(picked).toHaveLength(2);
  });

  it('offers fewer options when the words are too few, at least 2 in all', () => {
    const small: DistractorPool = { cards: [shijian, mao], introduced: new Set() };

    expect(pickDistractors(shijian, small, 3, createRng('seed'), MINI_GAME_CONFIG)).toEqual([mao]);
  });

  it('is not eligible when no word can be a distractor, as with synonyms only', () => {
    const synonyms: DistractorPool = {
      cards: [shijian, zh('a', '时候', 'shíhou', 'temps'), zh('b', '时光', 'shíguāng', 'le temps')],
      introduced: new Set(),
    };

    expect(
      pickDistractors(shijian, synonyms, 2, createRng('seed'), MINI_GAME_CONFIG),
    ).toBeUndefined();
  });

  it('draws the same distractors from the same seed', () => {
    const once = pickDistractors(shijian, pool, 2, createRng('s'), MINI_GAME_CONFIG);

    expect(pickDistractors(shijian, pool, 2, createRng('s'), MINI_GAME_CONFIG)).toEqual(once);
  });
});
