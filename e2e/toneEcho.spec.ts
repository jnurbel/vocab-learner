import { expect, test } from '@playwright/test';
import { installFakeSpeech, nextSpoken, openMiniGame, spokenCount } from './fakeSpeech.ts';
import { openWords } from './navigation.ts';

test('ToneEcho: the tones of a word typed right, then wrong with both tone curves', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await installFakeSpeech(page);
  await page.goto('./');
  await openWords(page);
  await page.getByLabel('Un mot par ligne').fill('时间 | shíjiān | temps');
  await page.getByRole('button', { name: 'Ajouter 1 mot' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(2);

  await openMiniGame(page, 'Échos des tons');
  const game = page.getByRole('region', { name: 'Mini-jeu : échos des tons' });
  await game.getByRole('button', { name: 'Commencer' }).click();
  expect(await nextSpoken(page, 0)).toBe('时间');

  // Right: the citation tones of 时间, 2 then 1.
  const tones = game.getByRole('textbox', { name: 'Tons du mot' });
  await tones.fill('21');
  await tones.press('Enter');
  await expect(game.getByRole('status')).toContainText('Juste.');
  await expect(game.getByRole('status')).toContainText('temps');

  // Wrong: the sound heard is replayed, the curves heard and chosen are drawn.
  await expect(tones).toBeEnabled();
  const before = await spokenCount(page);
  await tones.fill('44');
  await tones.press('Enter');
  await expect(game.getByRole('status')).toContainText('Tu as entendu shíjiān');
  await expect(game.getByRole('img', { name: 'Tons : 2e ton puis 1er ton' })).toBeVisible();
  await expect(game.getByRole('img', { name: 'Tons : 4e ton puis 4e ton' })).toBeVisible();
  await expect.poll(() => spokenCount(page)).toBeGreaterThan(before);
  await expect(game.getByRole('button', { name: 'Continuer' })).toBeFocused();
  expect(errors).toEqual([]);
});
