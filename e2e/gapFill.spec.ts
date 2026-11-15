import { expect, test } from '@playwright/test';
import { installFakeSpeech, openMiniGame } from './fakeSpeech.ts';
import { addChineseWords, watchForeignRequests } from './sentenceGames.ts';

test('GapFill: a bank sentence with a gap, its folded translation and its Tatoeba credit', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  const foreign = watchForeignRequests(page, new URL(baseURL ?? '').origin);
  await installFakeSpeech(page);
  await page.goto('./');
  await addChineseWords(page, [
    ['朋友', 'ami'],
    ['猫', 'chat'],
    ['狗', 'chien'],
  ]);

  await openMiniGame(page, 'La phrase à trous');
  const game = page.getByRole('region', { name: 'Mini-jeu : la phrase à trous' });
  await game.getByRole('button', { name: 'Commencer' }).click();
  await expect(game.getByRole('img', { name: 'mot manquant' })).toBeVisible();
  await expect(game.getByText('Voir la traduction')).toBeVisible();

  // The word asked is drawn: "Je ne sais pas" shows it, whatever it is.
  await game.getByRole('button', { name: /Je ne sais pas/ }).click();
  const feedback = game.getByRole('status');
  await expect(feedback).toContainText('C’était');
  await expect(feedback).toContainText('Phrase : Tatoeba');
  await expect(feedback.getByRole('link').first()).toHaveAttribute(
    'href',
    /^https:\/\/tatoeba\.org\/fr\/sentences\/show\/\d+$/,
  );
  await game.getByRole('button', { name: 'Quitter' }).click();
  await expect(game.getByRole('heading', { name: 'Phrases à trous' })).toBeVisible();

  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});
