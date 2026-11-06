import { expect, test, type Page } from '@playwright/test';

interface StoredState {
  cardId: string;
  reps: number;
  lastRatedDay?: string;
}

/** Reads the review states straight from IndexedDB, as the app stored them. */
function storedReviewStates(page: Page): Promise<StoredState[]> {
  return page.evaluate(
    () =>
      new Promise<StoredState[]>((resolve, reject) => {
        const opening = indexedDB.open('vocab-learner-default');
        opening.onerror = () => {
          reject(new Error('Cannot open the database'));
        };
        opening.onsuccess = () => {
          const db = opening.result;
          const reading = db.transaction('reviewStates').objectStore('reviewStates').getAll();
          reading.onsuccess = () => {
            db.close();
            resolve(reading.result as StoredState[]);
          };
        };
      }),
  );
}

test('a learner reviews new words with flashcards, and a word is rated only once a day', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await page.goto('./');
  await page.getByLabel('Un mot par ligne').fill('猫 | mao1 | chat\n狗 | gou3 | chien');
  await page.getByRole('button', { name: 'Ajouter 2 mots' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(3);

  const menu = page.getByRole('navigation', { name: 'Menu' });
  await menu.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  const flashcards = page.getByRole('region', { name: 'Flashcards' });
  await expect(flashcards.getByText('1 / 2')).toBeVisible();

  // Both words were imported together, so their order is drawn from the session seed:
  // find out which one comes first instead of assuming it.
  // First card with the keyboard: Space turns it over, 3 means "Je savais".
  await page.keyboard.press('Space');
  const meaning = flashcards.getByText(/^(chat|chien)$/);
  await expect(meaning).toBeVisible();
  const known = (await meaning.textContent()) === 'chat' ? '猫' : '狗';
  await page.keyboard.press('3');
  await expect(flashcards.getByText('2 / 2')).toBeVisible();
  await expect(flashcards.getByRole('status')).toHaveText('Carte 2 sur 2');

  // Second card with the mouse: "À revoir".
  await flashcards.getByRole('button', { name: 'Retourner' }).click();
  await flashcards.getByRole('button', { name: 'À revoir' }).click();

  await expect(flashcards.getByRole('heading', { name: 'Session terminée' })).toBeVisible();
  await expect(flashcards.getByText('2 mot(s) nouveau(x)')).toBeVisible();
  await expect(
    flashcards.getByRole('list', { name: 'Mots qui ont changé de stade' }),
  ).toContainText(`${known} : Graine → Pousse`);

  // The same day, nothing is left: no word is rated twice.
  await flashcards.getByRole('button', { name: 'Nouvelle session' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(flashcards.getByText("Rien n'a soif aujourd'hui.")).toBeVisible();

  const states = await storedReviewStates(page);
  expect(states).toHaveLength(2);
  expect(states.map(({ reps }) => reps)).toEqual([1, 1]);
  expect(new Set(states.map(({ lastRatedDay }) => lastRatedDay)).size).toBe(1);

  await page.reload();
  const list = page.getByRole('table', { name: 'Liste des mots' });
  await expect(list.getByRole('row', { name: new RegExp(known) })).toContainText('Pousse');
  expect(errors).toEqual([]);
});
