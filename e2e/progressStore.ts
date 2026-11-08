import type { Page } from '@playwright/test';

/** The database of the default profile, as the app names it. */
const DATABASE = 'vocab-learner-default';
const SINGLETON_KEY = 'current';

export interface SimulatedProgress {
  xp: number;
  islandLevelSeen?: number;
  /** How many words (in the order of the database) reached the flower and the lantern stages. */
  flowers?: number;
  lanterns?: number;
}

/**
 * Writes a progress straight into IndexedDB, as if the learner had earned it, then reloads
 * the app so that it reads it. The app must have opened its database once before.
 */
export async function simulateProgress(page: Page, progress: SimulatedProgress): Promise<void> {
  await page.evaluate(
    async ({ database, key, xp, islandLevelSeen, flowers, lanterns }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database);
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(new Error('Cannot open the database'));
        };
      });
      const cardIds = await new Promise<string[]>((resolve, reject) => {
        const request = db.transaction('cards').objectStore('cards').getAllKeys();
        request.onsuccess = () => {
          resolve(request.result.map(String));
        };
        request.onerror = () => {
          reject(new Error('Cannot read the cards'));
        };
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['progress', 'reviewStates'], 'readwrite');
        transaction
          .objectStore('progress')
          .put(islandLevelSeen === undefined ? { xp } : { xp, islandLevelSeen }, key);
        const states = transaction.objectStore('reviewStates');
        cardIds.slice(0, flowers + lanterns).forEach((cardId, index) => {
          states.put({
            cardId,
            due: '2099-01-01T08:00:00.000Z',
            stability: 90,
            difficulty: 5,
            reps: 8,
            lapses: 0,
            state: 'review',
            lastReviewAt: new Date().toISOString(),
            successDays: 8,
            peakStage: index < lanterns ? 'lantern' : 'flower',
          });
        });
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(new Error('Cannot write the progress'));
        };
      });
      db.close();
    },
    {
      database: DATABASE,
      key: SINGLETON_KEY,
      xp: progress.xp,
      islandLevelSeen: progress.islandLevelSeen,
      flowers: progress.flowers ?? 0,
      lanterns: progress.lanterns ?? 0,
    },
  );
  await page.reload();
}
