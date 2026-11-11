import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the profile menu of the header, shown with the pseudonym of the profile open. */
export async function openProfileMenu(page: Page, current: string): Promise<Locator> {
  await page.getByRole('button', { name: `Profil : ${current}` }).click();
  return page.getByRole('region', { name: 'Profils' });
}

/** Creates a profile from the profile menu; the app then opens on it. */
export async function createProfile(page: Page, current: string, name: string): Promise<void> {
  const menu = await openProfileMenu(page, current);
  await menu.getByLabel('Pseudo du nouveau profil').fill(name);
  await menu.getByRole('button', { name: 'Créer le profil' }).click();
  await expect(page.getByRole('button', { name: `Profil : ${name}` })).toBeVisible();
}

export async function switchProfile(page: Page, current: string, name: string): Promise<void> {
  const menu = await openProfileMenu(page, current);
  await menu.getByRole('button', { name: `Ouvrir le profil ${name}` }).click();
  await expect(page.getByRole('button', { name: `Profil : ${name}` })).toBeVisible();
}
