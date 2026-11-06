import { expect, test } from '@playwright/test';

test('the home page loads without errors or CSP violations', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto('./');

  await expect(page).toHaveTitle('vocab-learner');
  await expect(page.getByRole('heading', { level: 1, name: 'vocab-learner' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the first load does not download the pinyin library, fetched only when a pinyin is needed', async ({
  page,
}) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') {
      scripts.push(request.url());
    }
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'vocab-learner' })).toBeVisible();
  expect(scripts.some((url) => url.includes('pinyinProGenerator'))).toBe(false);

  await page.getByLabel('Un mot par ligne').fill('你好 || bonjour');

  await expect(page.getByLabel('Pinyin, ligne 1')).toHaveValue('nǐ hǎo');
  expect(scripts.some((url) => url.includes('pinyinProGenerator'))).toBe(true);
});
