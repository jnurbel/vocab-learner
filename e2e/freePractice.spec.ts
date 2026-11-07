import { expect, test, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';

interface StoredState {
  cardId: string;
  reps: number;
  due: string;
  lastRatedDay?: string;
  successDays: number;
  peakStage: string;
}

interface StoredSession {
  mode?: string;
  results: unknown[];
}

/** Reads a whole object store straight from IndexedDB, as the app stored it. */
function readStore<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const opening = indexedDB.open('vocab-learner-default');
        opening.onerror = () => {
          reject(new Error('Cannot open the database'));
        };
        opening.onsuccess = () => {
          const db = opening.result;
          const reading = db.transaction(name).objectStore(name).getAll();
          reading.onsuccess = () => {
            db.close();
            resolve(reading.result as T[]);
          };
        };
      }),
    storeName,
  );
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
}

async function addWords(page: Page, lines: string[]) {
  await page.getByLabel('Un mot par ligne').fill(lines.join('\n'));
  await page.getByRole('button', { name: `Ajouter ${String(lines.length)} mots` }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(
    lines.length + 1,
  );
}

test('after a finished session, free practice is offered and leaves the reviews untouched', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await openWords(page);
  await addWords(page, ['猫 | mao1 | chat', '狗 | gou3 | chien']);

  const menu = page.getByRole('navigation', { name: 'Menu' });
  await menu.getByRole('button', { name: 'Flashcards' }).click();
  const flashcards = page.getByRole('region', { name: 'Flashcards' });
  await expect(flashcards.getByText("Aujourd'hui : 0 à revoir, 2 nouveaux")).toBeVisible();
  await flashcards.getByRole('button', { name: 'Commencer' }).click();
  // The order of the cards is drawn from the session seed: never assume it.
  for (const position of ['1 / 2', '2 / 2']) {
    await expect(flashcards.getByText(position)).toBeVisible();
    await flashcards.getByRole('button', { name: 'Retourner' }).click();
    await flashcards.getByRole('button', { name: 'Je savais' }).click();
  }
  await expect(flashcards.getByRole('heading', { name: 'Session terminée' })).toBeVisible();

  await flashcards.getByRole('button', { name: 'Nouvelle session' }).click();
  await flashcards.getByRole('button', { name: 'Commencer' }).click();
  await expect(flashcards.getByText("Rien n'a soif aujourd'hui.")).toBeVisible();
  await expect(flashcards.getByText(/^Prochaine révision : .+, 2 mots$/)).toBeVisible();
  const before = await readStore<StoredState>(page, 'reviewStates');
  expect(before.map(({ reps }) => reps)).toEqual([1, 1]);

  await flashcards.getByRole('button', { name: 'Entraînement libre' }).click();
  await expect(
    flashcards.getByText('Entraînement libre : tes réponses ne changent pas tes révisions'),
  ).toBeVisible();
  await expect(flashcards.getByText('1 / 2')).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  await expect(flashcards.getByText('2 / 2')).toBeVisible();
  await flashcards.getByRole('button', { name: 'Retourner' }).click();
  await flashcards.getByRole('button', { name: 'À revoir' }).click();

  await expect(flashcards.getByRole('heading', { name: 'Entraînement terminé' })).toBeVisible();
  await expect(flashcards.getByText('2 mots vus')).toBeVisible();
  await expect(flashcards.getByText('Je savais : 1')).toBeVisible();
  await expect(flashcards.getByText('À revoir : 1')).toBeVisible();
  await expect(
    flashcards.getByRole('button', { name: 'Recommencer avec les mots à revoir' }),
  ).toBeVisible();

  const byCard = (states: StoredState[]) =>
    [...states].sort((a, b) => a.cardId.localeCompare(b.cardId));
  const after = await readStore<StoredState>(page, 'reviewStates');
  expect(byCard(after)).toEqual(byCard(before));
  const sessions = await readStore<StoredSession>(page, 'sessions');
  const practice = sessions.filter(({ mode }) => mode === 'practice');
  expect(practice).toHaveLength(1);
  expect(practice[0]?.results).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('a higher daily quota of new words gives a longer next session', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await openWords(page);
  const words = '一二三四五六七八九十百千'.split('').map((term, index) => {
    return `${term} | yi1 | mot ${String(index + 1)}`;
  });
  await addWords(page, words);

  const menu = page.getByRole('navigation', { name: 'Menu' });
  await menu.getByRole('button', { name: 'Flashcards' }).click();
  const flashcards = page.getByRole('region', { name: 'Flashcards' });
  await expect(flashcards.getByText("Aujourd'hui : 0 à revoir, 5 nouveaux")).toBeVisible();
  await expect(flashcards.getByText('7 mots nouveaux attendent (5 par jour)')).toBeVisible();

  await menu.getByRole('button', { name: 'Réglages' }).click();
  const quota = page.getByRole('combobox', { name: 'Mots nouveaux par jour' });
  await expect(quota).toHaveValue('5');
  await quota.selectOption('10');
  await expect(
    page.getByText("Réglage enregistré : il s'applique à la prochaine séance."),
  ).toBeVisible();

  await menu.getByRole('button', { name: 'Flashcards' }).click();
  await expect(flashcards.getByText("Aujourd'hui : 0 à revoir, 10 nouveaux")).toBeVisible();
  await expect(flashcards.getByText('2 mots nouveaux attendent (10 par jour)')).toBeVisible();
  await flashcards.getByRole('button', { name: 'Commencer' }).click();
  await expect(flashcards.getByText('1 / 10')).toBeVisible();
  expect(errors).toEqual([]);
});
