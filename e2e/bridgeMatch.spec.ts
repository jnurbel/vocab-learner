import { expect, test } from '@playwright/test';
import { installFakeSpeech, openMiniGame } from './fakeSpeech.ts';
import { openWords } from './navigation.ts';

const MEANING_OF: Readonly<Record<string, string>> = {
  猫: 'chat',
  狗: 'chien',
  鸟: 'oiseau',
  鱼: 'poisson',
};

test('BridgeMatch: a wrong link turns back, then every word is linked to its meaning', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await installFakeSpeech(page);
  await page.goto('./');
  await openWords(page);
  await page
    .getByLabel('Un mot par ligne')
    .fill('猫 | mao1 | chat\n狗 | gou3 | chien\n鸟 | niao3 | oiseau\n鱼 | yu2 | poisson');
  await page.getByRole('button', { name: 'Ajouter 4 mots' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(5);

  // New words (seeds) are always played at level 1: written words against meanings.
  await openMiniGame(page, 'Relier les deux rives');
  const game = page.getByRole('region', { name: 'Mini-jeu : relier les deux rives' });
  await game.getByRole('button', { name: 'Commencer' }).click();
  const words = game.getByRole('group', { name: 'Rive des mots' });
  const meanings = game.getByRole('group', { name: 'Rive des sens' });
  await expect(words.getByRole('button')).toHaveCount(4);

  // A wrong link: both cards turn back, nothing is linked.
  await words.getByRole('button', { name: '猫' }).click();
  await meanings.getByRole('button', { name: 'chien' }).click();
  await expect(game.getByRole('status')).toHaveText('Pas une paire : 猫 et chien.');
  await expect(words.getByRole('button', { name: '猫' })).toHaveAttribute('aria-pressed', 'false');
  await expect(words.getByRole('button', { name: '猫' })).toBeEnabled();

  // Every word linked to its meaning, found by their texts: the order is never assumed.
  for (const [term, meaning] of Object.entries(MEANING_OF)) {
    await words.getByRole('button', { name: term }).click();
    await meanings.getByRole('button', { name: meaning }).click();
    if (term !== '鱼') {
      await expect(game.getByRole('status')).toContainText(`Paire juste : ${term}, ${meaning}.`);
      await expect(words.getByRole('button', { name: term })).toBeDisabled();
    }
  }

  await expect(game.getByRole('heading', { name: 'Pont terminé' })).toBeVisible();
  await expect(game.getByText('2 / 4 paires du premier coup')).toBeVisible();
  expect(errors).toEqual([]);
});
