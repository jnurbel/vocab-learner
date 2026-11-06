import { describe, expect, it } from 'vitest';
import { card, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { labelMastery, wordProgress } from './wordProgress';

const moment = { now: new Date('2026-11-06T08:00:00Z'), today: '2026-11-06' };

describe('wordProgress', () => {
  it('shows a word never reviewed as a seed that is not thirsty', () => {
    expect(wordProgress(undefined, moment, srs)).toEqual({ stage: 'seed', thirst: 0 });
  });

  it('shows the current stage and the thirst of a reviewed word', () => {
    const due = reviewed('a', { due: '2026-11-05T08:00:00.000Z', successDays: 2, stability: 4 });
    const later = reviewed('b', { due: '2026-12-01T08:00:00.000Z', successDays: 1 });

    expect(wordProgress(due, moment, srs)).toEqual({ stage: 'stem', thirst: 1 });
    expect(wordProgress(later, moment, srs)).toEqual({ stage: 'sprout', thirst: 0 });
  });
});

describe('labelMastery', () => {
  it('counts the mastered words of a label in each language, words never reviewed included', () => {
    const cards = [
      card('a', undefined, { labelIds: ['l1'] }),
      card('b', undefined, { labelIds: ['l1'] }),
      card('c', undefined, { labelIds: ['l1'], language: 'en' }),
      card('d', undefined, { labelIds: ['other'] }),
    ];
    const states = [reviewed('a', { stability: 4, successDays: 2 }), reviewed('d')];

    expect(labelMastery('l1', cards, states, srs.config)).toEqual({
      zh: { mastered: 1, total: 2 },
      en: { mastered: 0, total: 1 },
    });
  });

  it('leaves out a language without any word in the label', () => {
    const cards = [card('a', undefined, { labelIds: ['l1'] })];

    expect(labelMastery('l1', cards, [], srs.config)).toEqual({
      zh: { mastered: 0, total: 1 },
    });
  });
});
