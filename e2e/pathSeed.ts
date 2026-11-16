import type { Page } from '@playwright/test';

/**
 * Validates the first six steps in the stored path, to reach the final challenge at once. The
 * sentences step counts the bank sentences since 0.11.0: common words no longer skip it.
 */
export async function reachFinalChallenge(page: Page, labelName = 'Leçon 7') {
  await page.evaluate(
    (wanted) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('vocab-learner-default');
        opening.onerror = () => {
          reject(new Error('The database did not open'));
        };
        opening.onsuccess = () => {
          const db = opening.result;
          const transaction = db.transaction(['labels', 'pathProgress'], 'readwrite');
          const reading = transaction.objectStore('labels').getAll();
          reading.onsuccess = () => {
            const labels = reading.result as { id: string; name: string }[];
            const lesson = labels.find(({ name }) => name === wanted);
            transaction.objectStore('pathProgress').put({
              labelId: lesson?.id,
              language: 'zh',
              steps: {
                discover: 'validated',
                listen: 'validated',
                recognize: 'validated',
                type: 'validated',
                dictation: 'validated',
                sentences: 'validated',
              },
            });
          };
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            reject(new Error('The path was not stored'));
          };
        };
      }),
    labelName,
  );
  await page.reload();
}
