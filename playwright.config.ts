import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const isCi = Boolean(process.env['CI']);

/**
 * E2E tests run against the production build served by `vite preview`, so the
 * real Content Security Policy and the /vocab-learner/ base path are exercised.
 * In CI the build artifact is downloaded beforehand; locally it is rebuilt.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(port)}/vocab-learner/`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: isCi
      ? `npm run preview -- --port ${String(port)} --strictPort`
      : `npm run build && npm run preview -- --port ${String(port)} --strictPort`,
    url: `http://localhost:${String(port)}/vocab-learner/`,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
