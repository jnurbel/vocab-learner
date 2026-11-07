import { describe, expect, it } from 'vitest';
import type { BackupData } from './backupDocument';
import { card, emptyData, label, now, reviewState, sampleData } from './backup.fixtures';
import { mergeBackupData } from './mergeBackupData';

function idGenerator() {
  let count = 0;
  return () => {
    count += 1;
    return `new-${String(count)}`;
  };
}

function data(overrides: Partial<BackupData>): BackupData {
  return { ...emptyData(), ...overrides };
}

const earlier = '2026-11-01T08:00:00.000Z';
const later = '2026-11-04T08:00:00.000Z';

describe('mergeBackupData', () => {
  it('restores everything into an empty profile', () => {
    expect(mergeBackupData(emptyData(), sampleData(), idGenerator())).toEqual(sampleData());
  });

  it('changes nothing when the same backup is merged again', () => {
    expect(mergeBackupData(sampleData(), sampleData(), idGenerator())).toEqual(sampleData());
  });

  it('keeps one word per language and term, with the labels of both sides', () => {
    const local = data({
      labels: [label('lesson', 'Leçon 3')],
      cards: [card('c1', 'Apple', ['lesson'], 'en')],
    });
    const incoming = data({
      labels: [label('fruits', 'Fruits')],
      cards: [{ ...card('x9', 'apple', ['fruits'], 'en'), translation: 'pomme (incoming)' }],
    });

    const merged = mergeBackupData(local, incoming, idGenerator());

    expect(merged.cards).toEqual([card('c1', 'Apple', ['lesson', 'fruits'], 'en')]);
    expect(merged.labels).toEqual([label('lesson', 'Leçon 3'), label('fruits', 'Fruits')]);
  });

  it('unites labels by name and moves the words of the incoming label to the local one', () => {
    const local = data({ labels: [label('animals', 'Animaux')] });
    const incoming = data({
      labels: [label('l7', ' animaux ')],
      cards: [card('c2', '狗', ['l7'])],
    });

    const merged = mergeBackupData(local, incoming, idGenerator());

    expect(merged.labels).toEqual([label('animals', 'Animaux')]);
    expect(merged.cards).toEqual([card('c2', '狗', ['animals'])]);
  });

  it('gives a new id to an incoming word or label whose id is taken, and follows it everywhere', () => {
    const local = data({ labels: [label('l1', 'Leçon 1')], cards: [card('c1', '猫', ['l1'])] });
    const incoming = data({
      labels: [label('l1', 'Couleurs')],
      cards: [card('c1', '红', ['l1'])],
      reviewStates: [reviewState('c1')],
      sessions: [
        {
          id: 's1',
          language: 'zh',
          startedAt: now,
          labelIds: ['l1'],
          results: [{ cardId: 'c1', outcome: 'correct' }],
        },
      ],
      pathProgress: [{ labelId: 'l1', language: 'zh', stepAttempts: { listen: { c1: true } } }],
      settings: { intensiveExamMode: { l1: true } },
      progress: { dailyRewardedCount: { c1: 2 } },
    });

    const merged = mergeBackupData(local, incoming, idGenerator());

    expect(merged.labels).toEqual([label('l1', 'Leçon 1'), label('new-1', 'Couleurs')]);
    expect(merged.cards).toEqual([card('c1', '猫', ['l1']), card('new-2', '红', ['new-1'])]);
    expect(merged.reviewStates).toEqual([reviewState('new-2')]);
    expect(merged.sessions[0]).toMatchObject({
      labelIds: ['new-1'],
      results: [{ cardId: 'new-2', outcome: 'correct' }],
    });
    expect(merged.pathProgress).toEqual([
      { labelId: 'new-1', language: 'zh', stepAttempts: { listen: { 'new-2': true } } },
    ]);
    expect(merged.settings).toEqual({ intensiveExamMode: { 'new-1': true } });
    expect(merged.progress).toEqual({ dailyRewardedCount: { 'new-2': 2 } });
  });

  it('keeps the most recently reviewed learning state of a word, with the highest stage ever', () => {
    const local = data({
      cards: [card('c1', '猫')],
      reviewStates: [reviewState('c1', { lastReviewAt: later, reps: 9, peakStage: 'sprout' })],
    });
    const incoming = data({
      cards: [card('c1', '猫')],
      reviewStates: [reviewState('c1', { lastReviewAt: earlier, reps: 4, peakStage: 'flower' })],
    });

    const merged = mergeBackupData(local, incoming, idGenerator());

    expect(merged.reviewStates).toEqual([
      reviewState('c1', { lastReviewAt: later, reps: 9, peakStage: 'flower' }),
    ]);
  });

  it('prefers a reviewed state to a never reviewed one', () => {
    const local = data({ cards: [card('c1', '猫')], reviewStates: [reviewState('c1')] });
    const incoming = data({
      cards: [card('c1', '猫')],
      reviewStates: [reviewState('c1', { lastReviewAt: earlier, peakStage: 'seed' })],
    });

    const merged = mergeBackupData(local, incoming, idGenerator());

    expect(merged.reviewStates).toEqual([
      reviewState('c1', { lastReviewAt: earlier, peakStage: 'sprout' }),
    ]);
  });

  it('takes the highest xp, level and best streak, and every unlock of both sides', () => {
    const local = data({
      progress: { xp: 500, level: 3, streakDays: 2, bestStreak: 4, unlocks: ['pond'] },
    });
    const incoming = data({
      progress: { xp: 800, level: 2, streakDays: 9, bestStreak: 9, unlocks: ['bridge', 'pond'] },
    });

    const merged = mergeBackupData(local, incoming, idGenerator());

    expect(merged.progress).toEqual({
      xp: 800,
      level: 3,
      streakDays: 2,
      bestStreak: 9,
      unlocks: ['pond', 'bridge'],
    });
  });

  it('keeps the highest level of the island seen, so that it never grows twice', () => {
    const merged = mergeBackupData(
      data({ progress: { islandLevelSeen: 4 } }),
      data({ progress: { islandLevelSeen: 7 } }),
      idGenerator(),
    );

    expect(merged.progress).toEqual({ islandLevelSeen: 7 });
  });

  it('keeps the progress fields that only one side has', () => {
    const merged = mergeBackupData(
      data({ progress: { xp: 10, stamps: 3 } }),
      data({ progress: { level: 2, unlocks: ['pond'] } }),
      idGenerator(),
    );

    expect(merged.progress).toStrictEqual({ xp: 10, stamps: 3, level: 2, unlocks: ['pond'] });
  });

  it('keeps the local unlocks when the backup progress has none', () => {
    const merged = mergeBackupData(
      data({ progress: { unlocks: ['pond'] } }),
      data({ progress: { xp: 5 } }),
      idGenerator(),
    );

    expect(merged.progress).toStrictEqual({ xp: 5, unlocks: ['pond'] });
  });

  it('keeps the history of a word deleted since, under its former id', () => {
    const incoming = data({
      sessions: [
        {
          id: 's1',
          language: 'zh',
          startedAt: now,
          results: [{ cardId: 'gone', outcome: 'wrong' }],
        },
      ],
    });

    const merged = mergeBackupData(emptyData(), incoming, idGenerator());

    expect(merged.sessions).toEqual(incoming.sessions);
  });

  it('adds no empty unlock list when neither side has unlocked anything', () => {
    const merged = mergeBackupData(
      data({ progress: { xp: 1 } }),
      data({ progress: { xp: 2 } }),
      idGenerator(),
    );

    expect(merged.progress).toStrictEqual({ xp: 2 });
  });

  it('keeps the local progress when the backup has none', () => {
    const merged = mergeBackupData(data({ progress: { xp: 10 } }), emptyData(), idGenerator());

    expect(merged.progress).toEqual({ xp: 10 });
  });

  it('keeps the settings of this device', () => {
    const merged = mergeBackupData(
      data({ settings: { dailyGoalXp: 200 } }),
      data({ settings: { dailyGoalXp: 500, sfxEnabled: false } }),
      idGenerator(),
    );

    expect(merged.settings).toEqual({ dailyGoalXp: 200 });
  });

  it('unites ignored terms, sessions and paths, the local side winning on the same key', () => {
    const local = data({
      labels: [label('animals', 'Animaux')],
      ignoredTerms: [{ language: 'en', term: 'the' }],
      sessions: [{ id: 's1', language: 'zh', startedAt: earlier, results: [] }],
      pathProgress: [{ labelId: 'animals', language: 'zh', finalChallengeBest: 12 }],
    });
    const incoming = data({
      labels: [label('animals', 'Animaux')],
      ignoredTerms: [
        { language: 'en', term: 'the' },
        { language: 'en', term: 'a' },
      ],
      sessions: [
        { id: 's1', language: 'zh', startedAt: earlier, results: [] },
        { id: 's2', language: 'en', startedAt: later, results: [] },
      ],
      pathProgress: [
        { labelId: 'animals', language: 'zh', finalChallengeBest: 18 },
        { labelId: 'animals', language: 'en' },
      ],
    });

    const merged = mergeBackupData(local, incoming, idGenerator());

    expect(merged.ignoredTerms).toEqual([
      { language: 'en', term: 'the' },
      { language: 'en', term: 'a' },
    ]);
    expect(merged.sessions.map(({ id }) => id)).toEqual(['s1', 's2']);
    expect(merged.pathProgress).toEqual([
      { labelId: 'animals', language: 'zh', finalChallengeBest: 12 },
      { labelId: 'animals', language: 'en' },
    ]);
  });
});
