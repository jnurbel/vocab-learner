import { expect, test } from '@playwright/test';
import { installFakeSpeech, openMiniGame } from './fakeSpeech.ts';
import { addChineseWords } from './sentenceGames.ts';

test('MeasureWord: a determiner, a gap and the noun, every right measure word told', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await installFakeSpeech(page);
  await page.goto('./');
  await addChineseWords(page, [
    ['书', 'livre'],
    ['猫', 'chat'],
    ['狗', 'chien'],
    ['朋友', 'ami'],
  ]);

  await openMiniGame(page, 'Le bon classificateur');
  const game = page.getByRole('region', { name: 'Mini-jeu : le bon classificateur' });
  await game.getByRole('button', { name: 'Commencer' }).click();
  await expect(game.getByRole('img', { name: 'classificateur manquant' })).toBeVisible();
  await expect(
    game.getByRole('group', { name: 'Quel classificateur va dans le trou ?' }).getByRole('button'),
  ).toHaveCount(4);

  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('0');
    await expect(game.getByRole('status')).toContainText('Classificateurs justes pour');
    await game.getByRole('button', { name: 'Continuer' }).click();
  }
  await expect(game.getByRole('heading', { name: 'Classificateurs' })).toBeVisible();
  expect(errors).toEqual([]);
});
