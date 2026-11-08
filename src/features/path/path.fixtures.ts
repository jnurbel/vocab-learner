import type { Language } from '../../domain/card';
import type { Label } from '../../domain/label';
import type { FinalChallengeFinishedEvent } from '../../domain/path/finalChallenge';
import { card, FakeStore } from '../flashcards/flashcards.fixtures';
import type { FinalChallengeStore } from './finalChallengeSession';

/** Test helpers shared by the path and final challenge tests. */

export const lessonLabel: Label = {
  id: 'lesson',
  name: 'Unit 3',
  isFocus: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const fruits = [
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

/** Ten English words of the label: typed answers are checked without pinyin. */
export const fruitWords = fruits.map((term) =>
  card(term, undefined, {
    language: 'en',
    term,
    translation: `fruit ${term}`,
    labelIds: ['lesson'],
  }),
);

/** The flashcards' fake store, which also keeps the scores of the final challenges. */
export class ChallengeStore extends FakeStore implements FinalChallengeStore {
  readonly finished: [string, Language, number, string][] = [];

  recordFinalChallenge(labelId: string, language: Language, score20: number, today: string) {
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
