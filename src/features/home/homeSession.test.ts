import { describe, expect, it } from 'vitest';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { loadHomeView } from './homeSession';

const morning = new Date('2026-11-06T08:00:00Z');

describe('loadHomeView', () => {
  it('builds the home of a language from the stored progress, settings and today’s sessions', async () => {
    const store = new FakeStore({
      reviewStates: [reviewed('due')],
      settings: { newPerDay: 3 },
      progress: { xp: 120, level: 2, lastActiveDate: '2026-11-06' },
      recentSessions: [
        {
          id: 's1',
          language: 'zh',
          startedAt: '2026-11-06T07:00:00.000Z',
          mode: 'flashcards',
          results: [
            {
              cardId: 'n0',
              outcome: 'correct',
              exercise: 'discovery',
              at: '2026-11-06T07:01:00.000Z',
            },
          ],
        },
      ],
    });
    const cards = [card('due'), ...['n0', 'n1', 'n2', 'n3'].map((id) => card(id))];

    const view = await loadHomeView(
      { cards, labels: [], language: 'zh' },
      { store, srs, clock: () => morning },
    );

    expect(view.today).toBe('2026-11-06');
    // 3 new words a day, 1 already introduced today.
    expect(view.session).toMatchObject({ reviewCount: 1, newCount: 2 });
    expect(view.progress).toMatchObject({ xp: 120, level: 2 });
    expect(store.loadedSince).toBe('2026-11-04T08:00:00.000Z');
  });

  it('starts a new profile with the default quota and a neutral progress zone', async () => {
    const view = await loadHomeView(
      { cards: [card('a')], labels: [], language: 'zh' },
      { store: new FakeStore(), srs, clock: () => morning },
    );

    expect(view.session.newCount).toBe(1);
    expect(view.progress).toBeUndefined();
  });
});
