import { expect, test, type Page } from '@playwright/test';

interface StoredResult {
  cardId: string;
  outcome: string;
  rating?: string;
  answer?: string;
}

interface StoredCard {
  id: string;
  term: string;
}

interface StoredState {
  cardId: string;
  reps: number;
  lapses: number;
}

/** Reads a whole object store straight from IndexedDB, as the app stored it. */
function storedRows<T>(page: Page, storeName: string): Promise<T[]> {
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

async function addWords(page: Page, lines: string, count: number) {
  await page.goto('./');
  await page.getByLabel('Un mot par ligne').fill(lines);
  await page
    .getByRole('button', { name: `Ajouter ${String(count)} mot${count > 1 ? 's' : ''}` })
    .click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(
    count + 1,
  );
}

async function openFlashcards(page: Page, answerMode: string) {
  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Flashcards' })
    .click();
  await page.getByRole('radio', { name: answerMode }).check();
  await page.getByRole('button', { name: 'Commencer' }).click();
  return page.getByRole('region', { name: 'Flashcards' });
}

test('typing the meaning accepts a synonym with other accents, and "J\'avais bon" leaves one "good"', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await addWords(page, '学生 | xue2 sheng1 | élève, écolier\n猫 | mao1 | chat', 2);
  const flashcards = await openFlashcards(page, 'Écrire le sens');
  const field = flashcards.getByLabel('Ta réponse');

  // The order of the cards is drawn from the session seed: read which word is shown.
  for (const position of [1, 2]) {
    await expect(flashcards.getByText(`${String(position)} / 2`)).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('lang', 'fr');
    const word = flashcards.getByText(/^(学生|猫)$/);
    if ((await word.textContent()) === '学生') {
      await field.fill('Eleve');
      await field.press('Enter');
      await expect(flashcards.getByTestId('typed-feedback')).toContainText('Juste.');
      await expect(flashcards.getByTestId('typed-feedback')).toContainText('Sens reconnu : élève');
    } else {
      await field.fill('félin');
      await field.press('Enter');
      await expect(flashcards.getByTestId('typed-feedback')).toContainText(
        'Faux. La réponse était chat.',
      );
      await flashcards.getByRole('button', { name: "J'avais bon" }).click();
      await expect(flashcards.getByTestId('typed-feedback')).toContainText('Compté juste.');
    }
    await flashcards.getByRole('button', { name: 'Continuer' }).click();
  }
  await expect(flashcards.getByRole('heading', { name: 'Session terminée' })).toBeVisible();

  const cards = await storedRows<StoredCard>(page, 'cards');
  const catId = cards.find(({ term }) => term === '猫')?.id;
  const sessions = await storedRows<{ results: StoredResult[] }>(page, 'sessions');
  const catResults = sessions
    .flatMap(({ results }) => results)
    .filter(({ cardId }) => cardId === catId);
  expect(catResults).toEqual([
    expect.objectContaining({ outcome: 'correct', rating: 'good', answer: 'félin' }),
  ]);
  const catState = (await storedRows<StoredState>(page, 'reviewStates')).find(
    ({ cardId }) => cardId === catId,
  );
  expect(catState).toMatchObject({ reps: 1, lapses: 0 });
  expect(errors).toEqual([]);
});

test('typing the word refuses the same sound written with other characters', async ({ page }) => {
  const errors = watchErrors(page);
  await addWords(page, '再见 | zai4 jian4 | au revoir', 1);
  const flashcards = await openFlashcards(page, 'Écrire le caractère');
  const field = flashcards.getByLabel('Ta réponse');
  await expect(flashcards.getByText('au revoir')).toBeVisible();
  await expect(field).toHaveAttribute('lang', 'zh-CN');

  await field.fill('在见');
  await field.press('Enter');

  const feedback = flashcards.getByTestId('typed-feedback');
  await expect(feedback).toContainText('Faux. La réponse était 再见.');
  await expect(feedback).toContainText('Bon son, mauvais caractère : 在见 au lieu de 再见.');
  await expect(
    feedback.getByRole('list', { name: 'Comparaison caractère par caractère' }),
  ).toBeVisible();
  await expect(flashcards.getByRole('button', { name: "J'avais bon" })).toHaveCount(0);

  const sessions = await storedRows<{ results: StoredResult[] }>(page, 'sessions');
  expect(sessions.flatMap(({ results }) => results)).toEqual([
    expect.objectContaining({ outcome: 'wrong', rating: 'again', answer: '在见' }),
  ]);
  expect(errors).toEqual([]);
});
