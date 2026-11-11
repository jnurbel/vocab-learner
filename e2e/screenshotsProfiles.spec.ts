import { expect, test, type Locator, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';
import { createProfile, openProfileMenu } from './profileMenu.ts';

/**
 * Screenshots of the profile menu and of the shared word lists, light and dark, on a computer
 * and on a phone, written to docs/ui/screenshots/ like those of screenshots.spec.ts.
 * Opt-in, as they rewrite files: UPDATE_SCREENSHOTS=1 npx playwright test screenshotsProfiles
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

const PACK = {
  format: 'vocab-learner-pack',
  version: 1,
  labels: [{ id: 'weather', name: 'Leçon 7' }],
  cards: [
    {
      language: 'zh',
      term: '天气',
      pinyin: 'tiān qì',
      translation: 'temps (météo)',
      labelIds: ['weather'],
    },
    {
      language: 'zh',
      term: '下雪',
      pinyin: 'xià xuě',
      translation: 'neiger',
      labelIds: ['weather'],
    },
    { language: 'en', term: 'weather', translation: 'météo', labelIds: ['weather'] },
  ],
};

/** On a computer, the whole page; on a phone, one screen scrolled to the part shown. */
async function shoot(page: Page, name: string, device: string, scheme: string, part: Locator) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (device === 'mobile') {
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

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of SCHEMES) {
    test.describe(`${device}, ${scheme}`, () => {
      test.use({ viewport, colorScheme: scheme });

      test('the profile menu, with a deletion asked for', async ({ page }) => {
        await page.goto('./');
        await createProfile(page, 'Moi', 'Léa');
        const menu = await openProfileMenu(page, 'Léa');
        await menu.getByRole('button', { name: 'Supprimer le profil Moi' }).click();
        await expect(menu.getByRole('group')).toBeVisible();
        // On a computer, the menu lives in the sidebar, which scrolls on its own.
        await menu.evaluate((element) => {
          element.scrollIntoView({ block: 'start' });
        });
        await shoot(page, 'profiles', device, scheme, menu);
      });

      test('sharing labels, and the preview of a shared list', async ({ page }) => {
        await page.goto('./');
        await openWords(page);
        const bulk = page.getByRole('region', { name: 'Saisie en lot' });
        const label = bulk.getByLabel('Nouveau label ou label existant (facultatif)');
        await bulk
          .getByLabel('Un mot par ligne')
          .fill('天气 | tiān qì | temps (météo)\n猫 | māo | chat');
        await label.fill('Leçon 7');
        await bulk.getByRole('button', { name: 'Ajouter 2 mots' }).click();
        await expect(bulk.getByRole('status')).toHaveText('2 mot(s) ajouté(s).');
        await bulk.getByLabel('Un mot par ligne').fill('狗 | gǒu | chien');
        await label.fill('Animaux');
        await bulk.getByRole('button', { name: 'Ajouter 1 mot' }).click();
        await expect(bulk.getByRole('status')).toHaveText('1 mot(s) ajouté(s).');
        const labels = page.getByRole('region', { name: 'Mes labels' });
        await labels.getByRole('checkbox', { name: 'Choisir Leçon 7 pour le partage' }).check();
        await labels.getByRole('checkbox', { name: 'Choisir Animaux pour le partage' }).check();
        await expect(
          labels.getByRole('button', { name: 'Partager la sélection (2 labels)' }),
        ).toBeEnabled();
        await shoot(page, 'pack-share', device, scheme, labels);

        await page.getByLabel('Choisir une liste de mots (.vocab.json)').setInputFiles({
          name: 'Leçon-7.vocab.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(PACK)),
        });
        const importer = page.getByRole('region', { name: 'Importer une liste partagée' });
        await expect(importer.getByRole('table', { name: 'Mots de la liste' })).toBeVisible();
        await shoot(page, 'pack-import', device, scheme, importer);
      });
    });
  }
}
