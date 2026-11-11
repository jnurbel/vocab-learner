import { expect, test, type Locator, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';

const TEXT =
  '今天是中秋节，我们吃月饼。月饼很甜！The cat watches the bright moon. Cats like the moon.';

/** The terms of the preview, read from the row headers. */
function previewTerms(preview: Locator): Promise<string[]> {
  return preview.locator('tbody th .term').allTextContents();
}

function rowOf(preview: Locator, term: string): Locator {
  return preview
    .getByRole('row')
    .filter({ has: preview.page().locator(`.term:text-is("${term}")`) });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

test('a learner pastes a Chinese and English text and only sees, adds or dismisses the new words', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await openWords(page);

  // Words already in the list are never proposed again.
  await page.getByLabel('Un mot par ligne').fill('月饼 || gâteau de lune\ncat | chat');
  await page.getByRole('button', { name: 'Ajouter 2 mots' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(3);

  const textImport = page.getByRole('region', { name: 'Depuis un texte' });
  await textImport.getByLabel('Texte à analyser').fill(TEXT);
  const preview = textImport.getByRole('table', { name: /Mots nouveaux du texte/ });
  await expect(textImport.getByLabel('Pinyin de 我们')).toHaveValue('wǒ men');
  const terms = await previewTerms(preview);
  expect(terms).toEqual(expect.arrayContaining(['我们', '吃', 'moon', 'bright']));
  expect(terms).not.toContain('月饼');
  expect(terms).not.toContain('cat');
  expect(terms).not.toContain('cats');
  await expect(rowOf(preview, 'moon')).toContainText('2');

  // A badly cut word is joined with the next one.
  await textImport.getByRole('button', { name: 'Joindre 中秋 et 节' }).click();
  await expect(rowOf(preview, '中秋节')).toBeVisible();

  await textImport.getByLabel('Sens de moon').fill('lune');
  await rowOf(preview, 'bright').getByRole('radio', { name: 'Je le connais déjà' }).check();
  await textImport.getByRole('button', { name: 'Enregistrer mes choix' }).click();
  await expect(textImport.getByRole('status')).toHaveText(
    '1 mot(s) ajouté(s), 1 mot(s) ne seront plus proposés.',
  );

  // The word added keeps the sentence of the text as its example.
  const list = page.getByRole('table', { name: 'Liste des mots' });
  await list.getByRole('button', { name: 'Modifier moon' }).click();
  const editor = page.getByRole('form', { name: 'Modifier « moon »' });
  await expect(editor.getByLabel('Exemple (facultatif)')).toHaveValue(
    'The cat watches the bright moon.',
  );
  await editor.getByRole('button', { name: 'Annuler' }).click();

  // After a reload, the word added and the word known already are no longer proposed.
  await page.reload();
  await openWords(page);
  const again = page.getByRole('region', { name: 'Depuis un texte' });
  await again.getByLabel('Texte à analyser').fill(TEXT);
  const secondPreview = again.getByRole('table', { name: /Mots nouveaux du texte/ });
  await expect(rowOf(secondPreview, '我们')).toBeVisible();
  const remaining = await previewTerms(secondPreview);
  expect(remaining).not.toContain('moon');
  expect(remaining).not.toContain('bright');

  expect(errors).toEqual([]);
});
