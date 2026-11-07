import { expect, test } from '@playwright/test';

test('a flashcard session earns XP, the summary shows it, and the daily goal grows', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto('./');
  await page.getByLabel('Un mot par ligne').fill('猫 | mao1 | chat\n狗 | gou3 | chien');
  await page.getByRole('button', { name: 'Ajouter 2 mots' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(3);

  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Flashcards' })
    .click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  const flashcards = page.getByRole('region', { name: 'Flashcards' });

  // The same answer for both words: their order does not matter.
  for (const position of ['1 / 2', '2 / 2']) {
    await expect(flashcards.getByText(position)).toBeVisible();
    await flashcards.getByRole('button', { name: 'Retourner' }).click();
    await flashcards.getByRole('button', { name: 'Je savais' }).click();
  }

  // Two words discovered (2 x 5), answered right (2 x 10), and the session completed (30).
  await expect(flashcards.getByRole('heading', { name: 'Session terminée' })).toBeVisible();
  await expect(flashcards.getByText('+60 XP')).toBeVisible();
  await expect(flashcards.getByText('Objectif du jour : 60 / 300 XP')).toBeVisible();
  await expect(flashcards.getByText('Série : 1 jour (record : 1)')).toBeVisible();
  await flashcards.getByText('Détail des XP').click();
  await expect(flashcards.getByText('Fin de séance : 30 XP')).toBeVisible();

  // Free practice earns points too: the daily goal keeps growing.
  await flashcards.getByRole('button', { name: 'Entraînement libre' }).click();
  for (const position of ['1 / 2', '2 / 2']) {
    await expect(flashcards.getByText(position)).toBeVisible();
    await flashcards.getByRole('button', { name: 'Retourner' }).click();
    await flashcards.getByRole('button', { name: 'Je savais' }).click();
  }
  await expect(flashcards.getByRole('heading', { name: 'Entraînement terminé' })).toBeVisible();
  await expect(flashcards.getByText('Objectif du jour : 80 / 300 XP')).toBeVisible();

  expect(errors).toEqual([]);
});
