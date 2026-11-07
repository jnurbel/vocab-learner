import { expect, test, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';

/** How far the page reaches past the right edge of the window, in CSS pixels. */
function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Words, a label and an import preview: the widest content of the words screen. */
async function fillWordsScreen(page: Page) {
  await page
    .getByLabel('Un mot par ligne')
    .fill('你好 || bonjour\n谢谢 | xie4xie | merci\napple | pomme');
  await expect(page.getByLabel('Pinyin, ligne 1')).toHaveValue('nǐ hǎo');
  await page
    .getByRole('group', { name: 'Labels à poser sur ces mots' })
    .getByLabel('Nouveau label ou label existant (facultatif)')
    .fill('Leçon 1');
  await page.getByRole('button', { name: 'Ajouter 3 mots' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' })).toBeVisible();
  await page.getByLabel('Un mot par ligne').fill('冷 || froid\nweather | météo');
  await expect(page.getByLabel('Pinyin, ligne 1')).toHaveValue('lěng');
}

test.describe('on a phone, 390 pixels wide', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the page never scrolls sideways and the menu is a bar at the bottom', async ({ page }) => {
    await page.goto('./');
    await openWords(page);
    await fillWordsScreen(page);

    expect(await horizontalOverflow(page)).toBe(0);
    const menu = page.getByRole('navigation', { name: 'Menu' });
    await expect(menu).toBeInViewport();
    const box = await menu.boundingBox();
    expect(box?.y ?? 0).toBeGreaterThan(844 / 2);
    expect(box?.width).toBe(390);

    for (const name of ['Flashcards', 'Dictée', 'Sauvegarde', 'Réglages']) {
      await menu.getByRole('button', { name }).click();
      await expect(menu.getByRole('button', { name })).toHaveAttribute('aria-current', 'page');
      expect(await horizontalOverflow(page)).toBe(0);
    }
  });
});

test.describe('on a computer, 1280 pixels wide', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the menu runs down the left side, next to the content', async ({ page }) => {
    await page.goto('./');
    await openWords(page);

    const menu = page.getByRole('navigation', { name: 'Menu' });
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    const mainBox = await page.getByRole('main').boundingBox();
    expect(menuBox?.x ?? 1280).toBeLessThan(100);
    expect(menuBox?.y ?? 800).toBeLessThan(200);
    expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(mainBox?.x ?? 0);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
