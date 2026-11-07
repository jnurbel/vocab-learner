import { expect, test, type Locator, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';

/**
 * Screenshots of the main screens, light and dark, on a computer and on a phone, written to
 * docs/ui/screenshots/ to compare the app with the mockups of docs/ui/mockups/.
 * Opt-in, as they rewrite files: UPDATE_SCREENSHOTS=1 npx playwright test screenshots
 */
test.skip(
  !process.env.UPDATE_SCREENSHOTS,
  'Set UPDATE_SCREENSHOTS=1 to refresh docs/ui/screenshots',
);

const VIEWPORTS = {
  desktop: { width: 1280, height: 820 },
  mobile: { width: 390, height: 844 },
} as const;
const SCHEMES = ['light', 'dark'] as const;

const WORDS = [
  '天气 | tiān qì | temps (météo)',
  '季节 || saison',
  '现在 | xian4 zai4 | maintenant',
  '下雪 | xià xuě | neiger',
  'weather | météo',
].join('\n');

/**
 * On a computer, the whole page from the top. On a phone, one screen of 390 × 844 as in
 * docs/ui/mockups/Mobile.dc.html, scrolled to the part shown, so that the bottom bar stays in place.
 */
async function shoot(page: Page, name: string, device: string, scheme: string, part?: Locator) {
  // Wait for the self-hosted font, so that every screenshot shows Plus Jakarta Sans.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (device === 'mobile' && part !== undefined) {
    await part.evaluate((element) => {
      element.scrollIntoView({ block: 'start' });
    });
  } else {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
  }
  await page.screenshot({
    path: `docs/ui/screenshots/${name}-${device}-${scheme}.png`,
    fullPage: device === 'desktop',
    animations: 'disabled',
  });
}

async function addWords(page: Page) {
  await page.getByLabel('Un mot par ligne').fill(WORDS);
  await expect(page.getByLabel('Pinyin, ligne 2')).toHaveValue('jì jié');
  await page
    .getByRole('group', { name: 'Labels à poser sur ces mots' })
    .getByLabel('Nouveau label ou label existant (facultatif)')
    .fill('Leçon 7');
  await page.getByRole('button', { name: 'Ajouter 5 mots' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(6);
}

function menu(page: Page) {
  return page.getByRole('navigation', { name: 'Menu' });
}

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of SCHEMES) {
    test.describe(`${device}, ${scheme}`, () => {
      test.use({ viewport, colorScheme: scheme });

      test('words, import preview, labels, settings and backup', async ({ page }) => {
        await page.goto('./');
        await openWords(page);
        await addWords(page);
        await page.getByLabel('Un mot par ligne').fill('冷 || froid\n天气 || temps\nrain |');
        await expect(page.getByLabel('Pinyin, ligne 1')).toHaveValue('lěng');
        await shoot(page, 'words', device, scheme);
        if (device === 'mobile') {
          // The whole words screen is one page on a computer; on a phone, its other cards.
          const bulk = page.getByRole('region', { name: 'Saisie en lot' });
          await shoot(page, 'import', device, scheme, bulk.getByRole('table'));
          const list = page.getByRole('region', { name: 'Mes mots' });
          await shoot(page, 'word-list', device, scheme, list);
        }

        await menu(page).getByRole('button', { name: 'Réglages' }).click();
        await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
        await shoot(page, 'settings', device, scheme);

        await menu(page).getByRole('button', { name: 'Sauvegarde' }).click();
        await expect(
          page.getByRole('button', { name: 'Sauvegarder sur cet appareil' }),
        ).toBeVisible();
        await shoot(page, 'backup', device, scheme);
      });

      test('flashcards: setup, a turned card, a typed answer with its diff', async ({ page }) => {
        await page.goto('./');
        await openWords(page);
        await addWords(page);
        await menu(page).getByRole('button', { name: 'Flashcards' }).click();
        const flashcards = page.getByRole('region', { name: 'Flashcards' });
        await page.getByRole('radio', { name: "S'auto-évaluer" }).check();
        await shoot(page, 'flashcards-setup', device, scheme, flashcards);

        await flashcards.getByRole('button', { name: 'Commencer' }).click();
        await flashcards.getByRole('button', { name: 'Retourner' }).click();
        await expect(flashcards.getByRole('group', { name: 'Tu le savais ?' })).toBeVisible();
        await shoot(page, 'flashcards-card', device, scheme, flashcards);

        await flashcards.getByRole('button', { name: 'Quitter' }).click();
        await page.getByRole('button', { name: 'Nouvelle session' }).click();
        await page.getByRole('radio', { name: 'Écrire le caractère' }).check();
        await flashcards.getByRole('button', { name: 'Commencer' }).click();
        const field = flashcards.getByLabel('Ta réponse');
        await field.fill('现再');
        await field.press('Enter');
        await expect(flashcards.getByTestId('typed-feedback')).toBeVisible();
        await shoot(
          page,
          'flashcards-typed',
          device,
          scheme,
          flashcards.getByTestId('typed-feedback'),
        );
      });

      test('dictation: setup and a wrong answer with its diff', async ({ page }) => {
        await page.goto('./');
        await openWords(page);
        await addWords(page);
        await menu(page).getByRole('button', { name: 'Dictée' }).click();
        const dictation = page.getByRole('region', { name: 'Dictée' });
        await dictation.getByRole('radio', { name: 'Au clavier' }).check();
        await shoot(page, 'dictation-setup', device, scheme, dictation);

        await dictation.getByRole('button', { name: 'Commencer la dictée' }).click();
        await expect(dictation.getByRole('status')).toContainText('Mot 1 sur');
        await dictation.getByRole('textbox', { name: 'Ta réponse' }).fill('现再');
        await dictation.getByRole('textbox', { name: 'Ta réponse' }).press('Enter');
        await expect(dictation.getByRole('button', { name: 'Continuer' })).toBeVisible();
        await shoot(page, 'dictation-answer', device, scheme, dictation.getByRole('status'));
      });
    });
  }
}
