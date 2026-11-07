import { describe, expect, it } from 'vitest';
import { EXAM_CONFIG } from '../../domain/exam/examConfig';
import { card, focusLabel, reviewed, words } from '../../domain/exam/exam.fixtures';
import type { Label } from '../../domain/label';
import { GAME_CONFIG } from '../../domain/srs/config';
import { createFsrsMemoryModel } from '../../domain/srs/fsrsMemoryModel';
import { buildHomeView, type HomeViewInput } from './homeView';

const srs = {
  model: createFsrsMemoryModel(GAME_CONFIG.fsrs),
  config: GAME_CONFIG,
  timeZone: 'Europe/Paris',
};
const today = '2026-11-06';

function view(overrides: Partial<HomeViewInput>) {
  return buildHomeView(
    {
      cards: [],
      labels: [],
      states: [],
      today,
      language: 'zh',
      newPerDay: 5,
      newIntroducedToday: 0,
      ...overrides,
    },
    { srs, exam: EXAM_CONFIG },
  );
}

const plain = (id: string): Label => focusLabel(id, undefined, { isFocus: false });

describe('buildHomeView', () => {
  it('invites to add words when the language has none', () => {
    const result = view({ cards: words('en', 3, []).map((word) => ({ ...word, language: 'en' })) });

    expect(result.state).toBe('noCards');
    expect(result.session).toEqual({ reviewCount: 0, newCount: 0, minutes: 0 });
  });

  it('says that nothing is thirsty when nothing is due and no new word is left', () => {
    const cards = words('l', 2);
    const states = cards.map(({ id }) => reviewed(id, '2026-11-20T08:00:00Z'));

    expect(view({ cards, states }).state).toBe('nothingDue');
  });

  it('shows a card per pinned label with words in the language, nearest test first', () => {
    const labels = [focusLabel('b-pinned'), focusLabel('a-exam', '2026-11-13'), plain('other')];
    const cards = [...words('a-exam', 25), ...words('b-pinned', 4), ...words('other', 3)];

    const result = view({ cards, labels });

    expect(result.state).toBe('default');
    expect(result.focus.map(({ label }) => label.id)).toEqual(['a-exam', 'b-pinned']);
    const [exam, pinned] = result.focus;
    expect(exam).toMatchObject({ wordCount: 25, mastery: { mastered: 0, total: 25 }, newCount: 5 });
    expect(exam?.forecast).toMatchObject({ status: 'onTrack', daysLeft: 7 });
    expect(pinned?.forecast).toBeUndefined();
    expect(result.others.map(({ label }) => label.id)).toEqual(['other']);
  });

  it('counts the due words of each label, and those of the session', () => {
    const labels = [focusLabel('exam', '2026-11-13'), plain('other')];
    const cards = [...words('exam', 2), ...words('other', 3)];
    const states = cards.map(({ id }) => reviewed(id, '2026-11-05T08:00:00Z'));

    const result = view({ cards, labels, states });

    expect(result.focus[0]?.dueCount).toBe(2);
    expect(result.others[0]?.dueCount).toBe(3);
    // 5 reviews of about 8 s: 1 minute.
    expect(result.session).toEqual({ reviewCount: 5, newCount: 0, minutes: 1 });
  });

  it('caps the new words of the session at 12, and estimates its length', () => {
    const labels = [focusLabel('exam', '2026-11-07')];

    const result = view({ cards: words('exam', 18), labels });

    // 12 new words of about 32 s: 7 minutes.
    expect(result.session).toEqual({ reviewCount: 0, newCount: 12, minutes: 7 });
  });

  it('hides from a tab the labels without any word in its language', () => {
    const labels = [focusLabel('exam', '2026-11-13'), plain('other')];
    const cards = [card('cat', ['exam'], { language: 'en' }), card('猫', ['other'])];

    const result = view({ cards, labels });

    expect(result.focus).toEqual([]);
    expect(result.others.map(({ label }) => label.id)).toEqual(['other']);
  });

  it('lists the 3 words with the most lapses, which resist', () => {
    const cards = words('l', 5);
    const states = [
      reviewed('l1', '2026-11-20T08:00:00Z', { lapses: 1 }),
      reviewed('l2', '2026-11-20T08:00:00Z', { lapses: 4 }),
      reviewed('l3', '2026-11-20T08:00:00Z', { lapses: 0 }),
      reviewed('l4', '2026-11-20T08:00:00Z', { lapses: 2 }),
      reviewed('l5', '2026-11-20T08:00:00Z', { lapses: 2 }),
    ];

    const result = view({ cards, states });

    expect(result.resisting.map(({ card: word, lapses }) => [word.id, lapses])).toEqual([
      ['l2', 4],
      ['l4', 2],
      ['l5', 2],
    ]);
  });

  it('offers to undo the labels unpinned today after their test', () => {
    const unpinned = focusLabel('old', undefined, {
      isFocus: false,
      pastExamDate: '2026-11-05',
      unfocusedOn: today,
    });

    const result = view({ cards: words('old', 2), labels: [unpinned] });

    expect(result.unpinnedToday).toEqual([unpinned]);
  });

  it('reads the progress kept by the game, and today’s XP only when it is today’s', () => {
    const progress = {
      xp: 640,
      level: 4,
      streakDays: 3,
      bestStreak: 9,
      dailyXp: 80,
      dailyXpDay: today,
    };

    expect(view({ progress, settings: { dailyGoalXp: 150 } }).progress).toEqual({
      xp: 640,
      level: 4,
      streakDays: 3,
      bestStreak: 9,
      dailyXp: 80,
      dailyGoalXp: 150,
    });
    expect(view({ progress: { ...progress, dailyXpDay: '2026-11-05' } }).progress).toMatchObject({
      dailyXp: 0,
      dailyGoalXp: 300,
    });
  });

  it('shows a neutral progress zone until the game keeps any progress', () => {
    expect(view({}).progress).toBeUndefined();
    expect(view({ progress: { lastActiveDate: today } }).progress).toBeUndefined();
  });

  it('knows which tests are prepared in intensive mode', () => {
    const settings = { intensiveExamMode: { exam: true, other: false } };

    expect(view({ settings }).intensiveLabelIds).toEqual(['exam']);
  });
});
