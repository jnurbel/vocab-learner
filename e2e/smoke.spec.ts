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
