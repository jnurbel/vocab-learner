import { describe, expect, it } from 'vitest';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { openMiniGame } from './miniGameRecorder';

const morning = new Date('2026-11-06T08:00:00Z');
const word = card('w1', undefined, { term: '时间', pinyin: 'shíjiān', translation: 'temps' });

function open(store: FakeStore, exercise: 'toneEcho' | 'bridgeMatch' = 'toneEcho') {
  let clock = morning.getTime();
  return openMiniGame(
    exercise,
    { cards: [word], language: 'zh', labelIds: [] },
    { store, srs, clock: () => new Date((clock += 1000)), newId: () => 'game-1' },
  );
}

describe('a mini-game recorder', () => {
  it('stores an answer the FSRS does not rate without a review state, and still rewards it', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('w1')] });
    const recorder = await open(store);

    const recorded = await recorder.record({
      card: word,
      outcome: 'correct',
      hintsUsed: 0,
      responseMs: 1200,
    });

    expect(recorded.rated).toBe(false);
    expect(store.sessions[0]).toMatchObject({ id: 'game-1', mode: 'toneEcho', language: 'zh' });
    expect(store.answers[0]?.state).toBeUndefined();
    expect(store.answers[0]?.result).toEqual({
      cardId: 'w1',
      outcome: 'correct',
      exercise: 'toneEcho',
      hintsUsed: 0,
      responseMs: 1200,
      at: '2026-11-06T08:00:02.000Z',
    });
    expect(store.progress?.xp).toBe(10);
    expect(recorder.summary()).toEqual({ answered: 1, correct: 1 });
  });

  it('rates an answer once a day, as the other exercises do', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('w1')] });
    const recorder = await open(store, 'bridgeMatch');

    const first = await recorder.record({
      card: word,
      outcome: 'wrong',
      rating: 'again',
      hintsUsed: 0,
      responseMs: 900,
      answer: 'durée',
    });
    const second = await recorder.record({
      card: word,
      outcome: 'correct',
      rating: 'good',
      hintsUsed: 0,
      responseMs: 900,
    });

    expect([first.rated, second.rated]).toEqual([true, false]);
    expect(store.answers[0]?.state?.lastRatedDay).toBe('2026-11-06');
    expect(store.answers[0]?.result).toMatchObject({ rating: 'again', answer: 'durée' });
    expect(store.answers[1]?.state?.lapses).toBe(store.answers[0]?.state?.lapses);
  });

  it('moves the adaptive level of the game, stored per game and language', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('w1')] });
    const recorder = await open(store);

    for (let index = 0; index < 8; index++) {
      await recorder.record({ card: word, outcome: 'correct', hintsUsed: 0, responseMs: 500 });
    }

    expect(recorder.level).toBe(3);
    expect(store.progress?.gameLevels?.['toneEcho:zh']?.level).toBe(3);
  });

  it('starts from the stored level of the game', async () => {
    const store = new FakeStore(
      { reviewStates: [] },
      { gameLevels: { 'toneEcho:zh': { level: 1, window: [] } } },
    );

    expect((await open(store)).level).toBe(1);
  });

  it('earns the points of a finished round and ends the session', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('w1')] });
    const recorder = await open(store);
    await recorder.record({ card: word, outcome: 'correct', hintsUsed: 0, responseMs: 500 });

    await recorder.complete();

    expect(store.progress?.xp).toBe(40);
    expect(store.sessions[0]?.endedAt).toBeDefined();
    expect(recorder.rewards()?.xpGained).toBe(40);
  });

  it('ends a session left early without the points of a finished round', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('w1')] });
    const recorder = await open(store);
    await recorder.record({ card: word, outcome: 'wrong', hintsUsed: 0, responseMs: 500 });

    await recorder.quit();

    expect(store.progress?.xp).toBe(2);
    expect(store.sessions[0]?.endedAt).toBeDefined();
  });

  it('starts no session when nothing was answered', async () => {
    const store = new FakeStore();
    const recorder = await open(store);

    await recorder.quit();

    expect(store.sessions).toEqual([]);
  });
});
