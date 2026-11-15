import { expect, test } from '@playwright/test';
import { installFakeSpeech, openMiniGame } from './fakeSpeech.ts';
import { addChineseWords, watchForeignRequests } from './sentenceGames.ts';

test('SentenceWorkshop: a frequent error found, corrected, then the sentence judged', async ({
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
  await addChineseWords(page, [['朋友', 'ami']]);

  await openMiniGame(page, 'Atelier de phrases');
  const game = page.getByRole('region', { name: 'Atelier de phrases' });
  await game.getByRole('button', { name: 'Commencer' }).click();
  const field = game.getByRole('textbox', { name: 'Ta phrase avec 朋友' });

  await field.fill('我的朋友是高。');
  await game.getByRole('button', { name: 'Vérifier' }).click();
  const results = game.getByRole('status');
  await expect(results).toContainText('À corriger');
  await expect(results.locator('u')).toHaveText('是高');

  await field.fill('我的朋友很高。');
  await game.getByRole('button', { name: 'Vérifier' }).click();
  await expect(results).toContainText(
    'Aucune erreur fréquente trouvée. Compare avec la phrase modèle.',
  );
  await expect(results).toContainText('Phrase modèle');
  await game.getByRole('button', { name: 'Ma phrase est juste' }).click();

  await expect(game.getByText('1 phrase écrite.')).toBeVisible();
  await expect(game.getByText('Une banderole-phrase de plus sur ton île !')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/phrase correcte/i);
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});
