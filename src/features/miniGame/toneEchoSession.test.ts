import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import type { ToneEchoQuestion } from '../../domain/game/toneEcho';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { startToneEchoSession, TONE_ECHO_ROUND_SIZE } from './toneEchoSession';

const morning = new Date('2026-11-06T08:00:00Z');
const zh = [
  card('time', undefined, { term: '时间', pinyin: 'shíjiān', translation: 'temps' }),
  card('cat', undefined, { term: '猫', pinyin: 'māo', translation: 'chat' }),
];
const sheep = card('sheep', undefined, { language: 'en', term: 'sheep', translation: 'mouton' });

function start(store: FakeStore, cards: Card[], language: 'zh' | 'en' = 'zh') {
  let clock = morning.getTime();
  return startToneEchoSession(
    { cards, language, labelIds: [] },
    { store, srs, clock: () => new Date((clock += 1000)), newId: () => 'tone-1' },
  );
}

/** The right answer of a question, whatever it asks. */
function rightAnswer(question: ToneEchoQuestion): number | string {
  switch (question.kind) {
    case 'tone':
      return question.tone;
    case 'pattern':
      return question.pattern;
    case 'pair':
      return question.heard;
  }
}

describe('a ToneEcho session', () => {
  it('asks a round of 10 questions and stores each answer without an FSRS rating', async () => {
    const store = new FakeStore({ reviewStates: zh.map(({ id }) => reviewed(id)) });
    const session = await start(store, zh);
    let asked = 0;

    while (session.current !== undefined) {
      await session.answer(rightAnswer(session.current));
      asked += 1;
    }

    expect(asked).toBe(TONE_ECHO_ROUND_SIZE);
    expect(store.answers).toHaveLength(TONE_ECHO_ROUND_SIZE);
    expect(store.answers.every(({ state }) => state === undefined)).toBe(true);
    expect(store.answers[0]?.result).toMatchObject({ exercise: 'toneEcho', outcome: 'correct' });
    expect(store.answers[0]?.result.rating).toBeUndefined();
    expect(session.summary()).toEqual({ answered: 10, correct: 10 });
    expect(store.sessions[0]?.endedAt).toBeDefined();
  });

  it('asks the tone pattern of a two-syllable word at the starting level', async () => {
    const session = await start(new FakeStore(), zh);

    expect(session.current).toMatchObject({ kind: 'pattern', pattern: '21' });
  });

  it('stores a wrong answer with what was given', async () => {
    const store = new FakeStore();
    const session = await start(store, zh);

    const { outcome } = await session.answer('44');

    expect(outcome).toBe('wrong');
    expect(store.answers[0]?.result).toMatchObject({
      cardId: 'time',
      outcome: 'wrong',
      answer: '44',
    });
  });

  it('plays English pairs, storing only those that hold a word of the learner', async () => {
    const store = new FakeStore();
    const session = await start(store, [sheep], 'en');

    const first = session.current;
    expect(first?.kind === 'pair' && first.sides.map(({ text }) => text)).toEqual([
      'ship',
      'sheep',
    ]);
    while (session.current !== undefined) {
      await session.answer(rightAnswer(session.current));
    }

    expect(store.answers.length).toBeGreaterThan(0);
    expect(store.answers.every(({ result }) => result.cardId === 'sheep')).toBe(true);
    expect(session.summary()).toEqual({ answered: 10, correct: 10 });
  });

  it('gives no points for a round of our list only, and starts no session', async () => {
    const store = new FakeStore();
    const session = await start(store, [], 'en');

    while (session.current !== undefined) {
      await session.answer(rightAnswer(session.current));
    }

    expect(store.sessions).toEqual([]);
    expect(store.progress).toBeUndefined();
  });

  it('is not eligible without any word to hear', async () => {
    const session = await start(new FakeStore(), [card('x', undefined, { term: '一' })]);

    expect(session.eligible).toBe(false);
  });

  it('refuses an answer once the round is over, and leaves early with what was stored', async () => {
    const store = new FakeStore();
    const session = await start(store, zh);
    await session.answer('21');

    await session.quit();

    expect(session.current).toBeUndefined();
    expect(store.sessions[0]?.endedAt).toBeDefined();
    await expect(session.answer(1)).rejects.toThrow('The round is over');
  });

  it('asks only the imposed words', async () => {
    const session = await startToneEchoSession(
      { cards: zh, language: 'zh', labelIds: [], cardIds: ['cat'] },
      { store: new FakeStore(), srs, clock: () => morning, newId: () => 't' },
    );

    expect(session.current).toMatchObject({ kind: 'tone', char: '猫' });
  });
});
