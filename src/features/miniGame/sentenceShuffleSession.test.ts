import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import {
  SENTENCE_SHUFFLE_ROUND_SIZE,
  startSentenceShuffleSession,
  type SentenceShuffleSession,
  type ShuffleItem,
} from './sentenceShuffleSession';

const morning = new Date('2026-11-06T08:00:00Z');
const en = (id: string, example?: string, labelIds: string[] = ['l1']) =>
  card(id, undefined, {
    language: 'en',
    term: id,
    translation: `meaning ${id}`,
    labelIds,
    ...(example === undefined ? {} : { example }),
  });
const words: Card[] = [
  en('cat', 'I like my cat.'),
  en('dog', 'The dog runs fast.'),
  en('bird', 'A bird sings now.'),
  en('fish', 'Fish swim.'),
  en('cap'),
];

function start(
  store: FakeStore,
  { cardIds, level = 2 }: { cardIds?: string[]; level?: 1 | 2 | 3 } = {},
) {
  store.progress = { gameLevels: { 'sentenceShuffle:en': { level, window: [] } } };
  return startSentenceShuffleSession(
    { cards: words, language: 'en', labelIds: [], ...(cardIds === undefined ? {} : { cardIds }) },
    { store, srs, clock: () => morning, newId: () => 'sh-1' },
  );
}

const reviewedStore = () => new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });

function current(session: SentenceShuffleSession): ShuffleItem {
  const item = session.current;
  if (item === undefined) {
    throw new Error('No sentence');
  }
  return item;
}

/** The tile ids in the order of the sentence, found by their text: never by their position. */
function rightOrder(item: ShuffleItem): string[] {
  const left = item.tiles.filter(({ trap }) => !trap);
  return item.chunks.map((chunk) => {
    const index = left.findIndex(({ text }) => text === chunk);
    const [tile] = left.splice(index, 1);
    return tile?.id ?? '';
  });
}

describe('a SentenceShuffle session', () => {
  it('asks 3 sentences of 3 to 8 chunks, shuffled, and stores each one without a rating', async () => {
    const store = reviewedStore();
    const session = await start(store);
    let asked = 0;

    while (session.current !== undefined) {
      const item = current(session);
      expect(item.tiles.map(({ text }) => text).join(' ')).not.toBe(item.chunks.join(' '));
      expect(await session.check(rightOrder(item))).toMatchObject({ outcome: 'correct' });
      asked += 1;
    }

    expect(asked).toBe(SENTENCE_SHUFFLE_ROUND_SIZE);
    expect(store.answers).toHaveLength(3);
    expect(store.answers.every(({ state, result }) => state === undefined && !result.rating)).toBe(
      true,
    );
    expect(store.answers[0]?.result).toMatchObject({ exercise: 'sentenceShuffle' });
    expect(store.answers.map(({ result }) => result.cardId)).not.toContain('fish');
    expect(store.sessions[0]?.endedAt).toBeDefined();
  });

  it('keeps a wrong try unstored, with the chunks placed right from the start', async () => {
    const store = reviewedStore();
    const session = await start(store);
    const order = rightOrder(current(session));
    const swapped = [order[0] ?? '', ...order.slice(1).reverse()];

    const checked = await session.check(swapped);

    expect(checked).toEqual({ outcome: 'wrong', keep: 1, canRetry: true });
    expect(store.answers).toEqual([]);
    expect(await session.check(order)).toMatchObject({ outcome: 'correctWithHint' });
    expect(store.answers[0]?.result.outcome).toBe('correctWithHint');
  });

  it('stores the sentence as missed when the learner gives up after two tries', async () => {
    const store = reviewedStore();
    const session = await start(store);
    const backwards = [...rightOrder(current(session))].reverse();

    await session.check(backwards);
    expect(await session.check(backwards)).toMatchObject({ outcome: 'wrong', canRetry: false });
    await session.giveUp();

    expect(store.answers[0]?.result).toMatchObject({ outcome: 'wrong' });
    expect(session.position).toBe(1);
  });

  it('accepts "J\'étais juste" as right, without a rating', async () => {
    const store = reviewedStore();
    const session = await start(store);

    await session.check([...rightOrder(current(session))].reverse());
    await session.claimRight();

    expect(store.answers[0]?.result).toMatchObject({ outcome: 'correct' });
    expect(store.answers[0]?.state).toBeUndefined();
  });

  it('adds a trap chunk at level 3, which must stay unused', async () => {
    const session = await start(reviewedStore(), { level: 3 });
    const item = current(session);
    const trap = item.tiles.find(({ trap: isTrap }) => isTrap);

    expect(trap).toBeDefined();
    expect(item.difficulty).toBe(3);
    expect(await session.check([...rightOrder(item), trap?.id ?? ''])).toMatchObject({
      outcome: 'wrong',
    });
  });

  it('asks only the imposed words, and is not eligible without a sentence to put back', async () => {
    const imposed = await start(reviewedStore(), { cardIds: ['dog'] });
    expect(current(imposed).target.id).toBe('dog');
    expect(imposed.total).toBe(1);

    const none = await start(reviewedStore(), { cardIds: ['fish', 'cap'] });
    expect(none.eligible).toBe(false);
  });

  it('refuses tiles that are not on the board, and an answer once the round is over', async () => {
    const session = await start(reviewedStore(), { cardIds: ['dog'] });

    await expect(session.check(['nope'])).rejects.toThrow('Not a tile');
    await session.quit();
    await expect(session.check([])).rejects.toThrow('The round is over');
    await expect(session.giveUp()).rejects.toThrow('The round is over');
  });
});
