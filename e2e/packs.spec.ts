import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';
import { createProfile } from './profileMenu.ts';

function collectErrors(page: Page): string[] {
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

async function addWords(page: Page, lines: string, labelName: string, count: number) {
  const bulkEntry = page.getByRole('region', { name: 'Saisie en lot' });
  await bulkEntry.getByLabel('Un mot par ligne').fill(lines);
  await bulkEntry.getByLabel('Nouveau label ou label existant (facultatif)').fill(labelName);
  await bulkEntry.getByRole('button', { name: `Ajouter ${String(count)} mots` }).click();
  await expect(bulkEntry.getByRole('status')).toHaveText(`${String(count)} mot(s) ajouté(s).`);
}

test.describe('shared word lists', () => {
  // A computer without a share sheet: the pack is downloaded, so that the test can read it.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(Navigator.prototype, 'share');
      Reflect.deleteProperty(Navigator.prototype, 'canShare');
    });
  });

  test('a label shared as a pack is imported into another profile, without any progress', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await openWords(page);
    await addWords(page, '猫 | mao1 | chat\ndog | chien', 'Animaux', 2);
    await addWords(page, 'apple | pomme\npear | poire', 'Fruits', 2);

    // Some progress on the words, which must not travel with the pack.
    const menu = page.getByRole('navigation', { name: 'Menu' });
    await menu.getByRole('button', { name: 'Flashcards' }).click();
    await page.getByRole('button', { name: 'Commencer' }).click();
    await page.getByRole('button', { name: 'Retourner' }).click();
    await page.getByRole('button', { name: 'Je savais' }).click();
    await expect(page.getByRole('heading', { name: 'Session terminée' })).toBeVisible();

    await openWords(page);
    const labels = page.getByRole('region', { name: 'Mes labels' });
    const downloading = page.waitForEvent('download');
    await labels.getByRole('button', { name: 'Partager Animaux' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('Animaux.vocab.json');
    // The path is the temporary file Playwright saved the download to, not an input.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const text = await readFile(await download.path(), 'utf8');
    await expect(labels.getByRole('status')).toContainText('Liste téléchargée');
    const pack = JSON.parse(text) as { format: string; cards: { term: string }[] };
    expect(pack.format).toBe('vocab-learner-pack');
    expect(pack.cards.map(({ term }) => term).sort()).toEqual(['dog', '猫']);
    expect(text).not.toMatch(/stability|reps|"due"|xp|createdAt|source|pomme|Moi/);

    await createProfile(page, 'Moi', 'Léa');
    await openWords(page);
    await expect(page.getByText('Aucun mot pour ce filtre.')).toBeVisible();
    await page.getByLabel('Choisir une liste de mots (.vocab.json)').setInputFiles({
      name: 'Animaux.vocab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    const importer = page.getByRole('region', { name: 'Importer une liste partagée' });
    await expect(importer.getByRole('table', { name: 'Mots de la liste' })).toBeVisible();
    await expect(importer).toContainText('Labels créés : Animaux');
    await importer.getByRole('button', { name: 'Importer 2 mots' }).click();
    await expect(importer.getByRole('status')).toHaveText(
      '2 mot(s) ajouté(s), 0 mot(s) déjà connu(s) étiqueté(s).',
    );

    const list = page.getByRole('table', { name: 'Liste des mots' });
    await expect(list.getByRole('row')).toHaveCount(3);
    await expect(list.getByRole('row', { name: /猫/ })).toContainText('Animaux');
    await expect(list.getByRole('row', { name: /猫/ })).toContainText('Graine');
    await expect(list.getByRole('row', { name: /dog/ })).toContainText('Graine');
    // Not a single word to review today: the words start from scratch, unlearnt.
    await menu.getByRole('button', { name: 'Jardin' }).click();
    await expect(page.getByRole('img', { name: /^Île niveau 1/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a hostile pack is refused with an explanation, and imports nothing', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await openWords(page);

    await page.getByLabel('Choisir une liste de mots (.vocab.json)').setInputFiles({
      name: 'trap.vocab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        '{"__proto__":{"polluted":true},"format":"vocab-learner-pack","version":1,"labels":[],"cards":[]}',
      ),
    });

    const importer = page.getByRole('region', { name: 'Importer une liste partagée' });
    await expect(importer.getByRole('alert')).toContainText('données inattendues');
    expect(await page.evaluate(() => 'polluted' in {})).toBe(false);
    await expect(page.getByText('Aucun mot pour ce filtre.')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
