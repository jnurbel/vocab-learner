import { expect, test, type Page } from '@playwright/test';
import { simulateProgress } from './progressStore.ts';

function menu(page: Page) {
  return page.getByRole('navigation', { name: 'Menu' });
}

async function openGarden(page: Page) {
  await menu(page).getByRole('button', { name: 'Jardin' }).click();
  return page.getByRole('region', { name: 'Ton jardin de mots' });
}

async function islandWidth(page: Page): Promise<number> {
  const box = await page.getByTestId('island-land').boundingBox();
  return box?.width ?? 0;
}

test.describe('the island of the garden', () => {
  test.use({ reducedMotion: 'reduce' });

  test('grows from the islet of level 1 to a bigger island with a pier at level 8', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    // The island is drawn without any inline style: the strict CSP refuses none of it.
    page.on('console', (message) => {
      if (message.text().includes('Content Security Policy')) {
        errors.push(message.text());
      }
    });

    // The app opens on the home screen: the garden is one menu click away.
    await page.goto('./');
    await expect(menu(page)).toBeVisible();
    await simulateProgress(page, { xp: 0 });
    let garden = await openGarden(page);
    const islet = garden.getByRole('img', { name: /^Île niveau 1 :/ });
    await expect(islet).toHaveAccessibleName(
      'Île niveau 1 : 2 parcelles. Prochain : ponton, niveau 2.',
    );
    await expect(garden.getByTestId('island-next')).toContainText('niveau 2');
    const smallWidth = await islandWidth(page);

    // Level 8 is reached at 1750 XP (GAME_DESIGN.md 4.3).
    await simulateProgress(page, { xp: 1750, islandLevelSeen: 1 });
    garden = await openGarden(page);
    const island = garden.getByRole('img', { name: /^Île niveau 8/ });
    await expect(island).toHaveAccessibleName(/ponton, lampions, bancs de pierre, étang/);
    await expect(island).toHaveAccessibleName(/palette automne/);
    await expect(island.locator('[data-decor="pier"]')).toHaveCount(1);
    await expect(garden.getByTestId('island-next')).toContainText('niveau 9');
    await expect(garden.getByText('niveau 1 → niveau 8')).toBeVisible();
    // The camera zooms out a little as the island grows: on screen, it still grows by half.
    expect(await islandWidth(page)).toBeGreaterThan(smallWidth * 1.5);

    const items = garden.getByRole('list', { name: 'Déjà sur ton île' });
    await expect(items.getByText('Ponton en bois')).toBeVisible();
    await expect(items.getByText('3 parcelles de mots')).toBeVisible();

    // The level seen is remembered: the next visit does not grow the island again.
    await page.reload();
    garden = await openGarden(page);
    await expect(garden.getByRole('img', { name: /^Île niveau 8/ })).toBeVisible();
    await expect(garden.getByText('niveau 1 → niveau 8')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test('the island grows in about 800 ms after a level up, then stays at its new size', async ({
  page,
}) => {
  await page.goto('./');
  await expect(menu(page)).toBeVisible();
  await simulateProgress(page, { xp: 1750, islandLevelSeen: 1 });
  const garden = await openGarden(page);

  await expect(garden.getByRole('img', { name: /^Île niveau 8/ })).toBeVisible();
  const early = await islandWidth(page);
  // The growth lasts about 800 ms: after it, the island no longer moves.
  await page.waitForTimeout(1200);
  const grown = await islandWidth(page);
  expect(grown).toBeGreaterThan(early * 1.1);
  await page.waitForTimeout(300);
  expect(await islandWidth(page)).toBeCloseTo(grown, 0);
});
