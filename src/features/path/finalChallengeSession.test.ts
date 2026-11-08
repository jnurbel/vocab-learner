import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import type { FinalChallengeFinishedEvent } from '../../domain/path/finalChallenge';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import {
  startFinalChallenge,
  type FinalChallengeSession,
  type FinalChallengeStore,
} from './finalChallengeSession';

const morning = new Date('2026-11-07T08:00:00Z');
const label: Label = {
  id: 'lesson',
  name: 'Unit 3',
  isFocus: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const terms = [
  'apple',
  'banana',
  'cherry',
  'grape',
  'lemon',
  'mango',
  'melon',
  'peach',
  'pear',
  'plum',
];
const words = terms.map((term) =>
  card(term, undefined, {
    language: 'en',
    term,
    translation: `fruit ${term}`,
    labelIds: ['lesson'],
  }),
);

class ChallengeStore extends FakeStore implements FinalChallengeStore {
  readonly finished: [string, string, number, string][] = [];

  recordFinalChallenge(labelId: string, language: 'zh' | 'en', score20: number, today: string) {
    this.finished.push([labelId, language, score20, today]);
    const event: FinalChallengeFinishedEvent = {
      type: 'FinalChallengeFinished',
      labelId,
      language,
      score20,
      passed: score20 >= 16,
      firstPass: score20 >= 16,
    };
    return Promise.resolve(event);
  }
}

async function start(
  store = new ChallengeStore({ reviewStates: words.map(({ id }) => reviewed(id)) }),
  audio = true,
) {
  let clock = morning.getTime();
  const session = await startFinalChallenge(
    { label, language: 'en', cards: words, audio },
    {
      store,
      srs,
      clock: () => new Date((clock += 1000)),
      newId: () => 'challenge-1',
      loadPinyin: () => Promise.reject(new Error('English only')),
    },
  );
  return { store, session };
}

/** Answers every question, right or wrong as asked, whatever the order of the words. */
async function answerAll(session: FinalChallengeSession, right: (word: Card) => boolean) {
  for (let item = session.current; item !== undefined; item = session.current) {
    const word = item.card;
    if (item.section === 'listening') {
      const wrong = item.question.options.find(({ id }) => id !== word.id);
      await session.choose(right(word) ? word : (wrong ?? 'unknown'));
    } else {
      await session.type(right(word) ? word.term : 'nothing');
    }
  }
}

describe('a final challenge', () => {
  it('asks 3 listening, 4 dictation and 3 translation questions on 10 words, in that order', async () => {
    const { session } = await start();

    const sections: string[] = [];
    for (let item = session.current; item !== undefined; item = session.current) {
      sections.push(item.section);
      await session.type(item.card.term).catch(() => session.choose(item.card));
    }

    expect(sections).toEqual([
      'listening',
      'listening',
      'listening',
      'dictation',
      'dictation',
      'dictation',
      'dictation',
      'translation',
      'translation',
      'translation',
    ]);
  });

  it('stores each answer with its exercise and an FSRS rating, once a day', async () => {
    const { session, store } = await start();

    await answerAll(session, () => true);

    expect(store.sessions[0]).toMatchObject({
      id: 'challenge-1',
      mode: 'finalChallenge',
      labelIds: ['lesson'],
    });
    expect(store.answers.map(({ result }) => result.exercise)).toEqual([
      ...Array<string>(3).fill('listenMeaning'),
      ...Array<string>(4).fill('listenType'),
      ...Array<string>(3).fill('typeEcho'),
    ]);
    expect(store.answers.every(({ result }) => result.rating === 'good')).toBe(true);
    expect(store.answers.every(({ state }) => state.lastRatedDay === '2026-11-07')).toBe(true);
  });

  it('scores the challenge out of 20 at the end, and stores it', async () => {
    const { session, store } = await start();
    await answerAll(session, (word) => word.id !== 'apple' && word.id !== 'pear');

    const result = await session.finish();

    expect(result.score.score20).toBe(16);
    expect(result.score.passed).toBe(true);
    expect(result.missed.map(({ card: missed }) => missed.id).sort()).toEqual(['apple', 'pear']);
    expect(store.finished).toEqual([['lesson', 'en', 16, '2026-11-07']]);
    expect(store.sessions[0]?.id).toBe('challenge-1');
  });

  it('counts "Je ne sais pas" as a wrong answer, rated again', async () => {
    const { session, store } = await start();

    await session.skip();

    expect(store.answers[0]?.result).toMatchObject({ outcome: 'wrong', rating: 'again' });
  });

  it('turns the dictation into translation without a voice', async () => {
    const { session } = await start(undefined, false);

    const sections = new Set<string>();
    for (let item = session.current; item !== undefined; item = session.current) {
      sections.add(item.section);
      await session.skip();
    }

    expect([...sections]).toEqual(['listening', 'translation']);
  });

  it('refuses an answer of the wrong kind for the question', async () => {
    const { session } = await start();

    await expect(session.type('apple')).rejects.toThrow();
    await answerAll(session, () => true);
    await expect(session.skip()).rejects.toThrow();
  });

  it('ends the stored session when the learner leaves', async () => {
    const { session, store } = await start();
    const ended = vi.spyOn(store, 'endSession');
    await session.skip();

    await session.quit();

    expect(ended).toHaveBeenCalledWith('challenge-1', expect.any(String));
    expect(session.current).toBeUndefined();
  });
});
