import { expect, test } from '@playwright/test';
import { openWords } from './navigation.ts';

test('the garden shows the words as plants, and its list view gives them in text', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto('./');
  await openWords(page);
  await page.getByLabel('Un mot par ligne').fill('猫 | mao1 | chat\nsnow | neige');
  await page.getByRole('button', { name: 'Ajouter 2 mots' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(3);

  const menu = page.getByRole('navigation', { name: 'Menu' });
  await menu.getByRole('button', { name: 'Jardin' }).click();
  const garden = page.getByRole('region', { name: 'Ton jardin de mots' });

  const chinese = garden.getByRole('list', { name: 'Parcelle 中文' });
  await expect(chinese.getByText('猫')).toBeVisible();
  await expect(chinese.getByText('Graine')).toBeVisible();
  await expect(
    garden.getByRole('list', { name: 'Parcelle English' }).getByText('snow'),
  ).toBeVisible();
  await expect(garden.getByRole('list', { name: 'Les stades' }).getByRole('listitem')).toHaveCount(
    6,
  );
  await expect(garden.getByText('Niveau 2 : Ponton en bois, encore 100 XP')).toBeVisible();

  await garden.getByRole('button', { name: 'Vue liste' }).click();
  const table = garden.getByRole('table', { name: 'Mots du jardin' });
  await expect(table.getByRole('row', { name: /猫/ })).toContainText('Graine');
  await expect(table.getByRole('row', { name: /猫/ })).toContainText('Pas soif');
  await expect(table.getByRole('row', { name: /snow/ })).toContainText('Anglais');

  await garden.getByRole('button', { name: 'Arroser (réviser)' }).click();
  await expect(page.getByRole('region', { name: 'Flashcards' })).toBeVisible();
  expect(errors).toEqual([]);
});
