import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { startBridgeMatchSession, type BridgeMatchSession } from './bridgeMatchSession';

const morning = new Date('2026-11-06T08:00:00Z');
const meanings = ['chat', 'chien', 'oiseau', 'poisson', 'cheval', 'vache', 'mouton', 'cochon'];
const sounds = ['māo', 'gǒu', 'niǎo', 'yú', 'mǎ', 'niú', 'yáng', 'zhū'];
const words = meanings.map((meaning, index) =>
  card(`w${String(index)}`, undefined, {
    term: `词${String(index)}`,
    pinyin: sounds[index] ?? '',
    translation: meaning,
  }),
);

function start(store: FakeStore, options: { cards?: Card[]; cardIds?: string[] } = {}) {
  let clock = morning.getTime();
  return startBridgeMatchSession(
    {
      cards: options.cards ?? words,
      language: 'zh',
      labelIds: [],
      voice: true,
      ...(options.cardIds === undefined ? {} : { cardIds: options.cardIds }),
    },
    { store, srs, clock: () => new Date((clock += 1000)), newId: () => 'bridge-1' },
  );
}

function board(session: BridgeMatchSession) {
  const current = session.board;
  if (current === undefined) {
    throw new Error('No board');
  }
  return current;
}

const reviewedWords = () => new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });

describe('a BridgeMatch session', () => {
  it('plays two boards of 5 pairs at the starting level, storing each pair found as an answer', async () => {
    const store = reviewedWords();
    const session = await start(store);
    const sizes: number[] = [];

    while (session.board !== undefined) {
      const { left } = board(session);
      sizes.push(left.length);
      for (const each of left) {
        await session.link(each.id, each.id);
      }
    }

    expect(sizes).toEqual([5, 3]);
    expect(store.answers).toHaveLength(8);
    expect(store.answers[0]?.result).toMatchObject({
      exercise: 'bridgeMatch',
      outcome: 'correct',
      rating: 'good',
    });
    expect(store.sessions[0]).toMatchObject({ mode: 'bridgeMatch' });
    expect(session.summary()).toEqual({ answered: 8, correct: 8 });
  });

  it('stores nothing for a wrong link, then counts both of its words as missed', async () => {
    const store = reviewedWords();
    const session = await start(store);
    const [first, second] = board(session).left as [Card, Card];

    const missed = await session.link(first.id, second.id);

    expect(missed).toEqual({ kind: 'mismatch' });
    expect(store.answers).toEqual([]);
    expect(await session.link(first.id, first.id)).toMatchObject({
      kind: 'match',
      outcome: 'wrong',
    });
    expect(await session.link(second.id, second.id)).toMatchObject({ outcome: 'wrong' });
    expect(store.answers.map(({ result }) => result.rating)).toEqual(['again', 'again']);
  });

  it('counts a wrong link once, however often it is tried', async () => {
    const store = reviewedWords();
    const session = await start(store);
    const [first, second] = board(session).left as [Card, Card];

    await session.link(first.id, second.id);
    await session.link(first.id, second.id);

    expect(session.matched.size).toBe(0);
    await session.link(first.id, first.id);
    expect(session.matched).toEqual(new Set([first.id]));
  });

  it('puts the imposed words on the first board', async () => {
    const session = await start(reviewedWords(), { cardIds: ['w6', 'w7'] });

    expect(board(session).left.map(({ id }) => id)).toEqual(expect.arrayContaining(['w6', 'w7']));
    expect(board(session).left).toHaveLength(5);
  });

  it('ends the round with the imposed words when they fit on one board', async () => {
    const session = await start(reviewedWords(), { cardIds: ['w6', 'w7'] });

    for (const each of board(session).left) {
      await session.link(each.id, each.id);
    }

    expect(session.board).toBeUndefined();
  });

  it('earns the points of a finished round and ends the session', async () => {
    const store = reviewedWords();
    const session = await start(store, { cards: words.slice(0, 4) });

    for (const each of board(session).left) {
      await session.link(each.id, each.id);
    }

    expect(session.board).toBeUndefined();
    expect(store.sessions[0]?.endedAt).toBeDefined();
    expect(session.rewards()?.breakdown).toMatchObject({ correct: 40, sessionCompleted: 30 });
  });

  it('is not eligible with fewer words than a board needs', async () => {
    const session = await start(reviewedWords(), { cards: words.slice(0, 2) });

    expect(session.eligible).toBe(false);
    expect(session.board).toBeUndefined();
  });

  it('refuses a link of words that are not on the board', async () => {
    const session = await start(reviewedWords(), { cards: words.slice(0, 4) });

    await expect(session.link('nope', 'w1')).rejects.toThrow('Not on the board');
  });

  it('leaves early with the pairs already stored', async () => {
    const store = reviewedWords();
    const session = await start(store);
    const [first] = board(session).left as [Card];
    await session.link(first.id, first.id);

    await session.quit();

    expect(session.board).toBeUndefined();
    expect(store.sessions[0]?.endedAt).toBeDefined();
    expect(session.rewards()?.breakdown.correct).toBe(10);
    expect(session.rewards()?.breakdown.sessionCompleted).toBeUndefined();
  });
});
