import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { tesseractAssets } from './config/tesseractAssets.ts';
import packageJson from './package.json' with { type: 'json' };

/**
 * The CSP in index.html is the production policy. The dev server injects styles
 * inline and uses a WebSocket for HMR, so relax the policy for `vite serve` only.
 */
function devCspRelaxation(): Plugin {
  return {
    name: 'dev-csp-relaxation',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws: wss:");
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/vocab-learner/
  base: '/vocab-learner/',
  plugins: [svelte(), svelteTesting(), devCspRelaxation(), tesseractAssets()],
  // Written into backups, so that a later app knows which version produced a file.
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.fixtures.ts',
        'src/setupTests.ts',
        'src/main.ts',
        'src/**/*.d.ts',
      ],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: {
        // The domain is written test-first: every line and branch must be covered.
        'src/domain/**': {
          100: true,
          perFile: true,
        },
        // Storage holds the user's only copy of their progress: fully covered as well.
        'src/storage/**': {
          100: true,
          perFile: true,
        },
        // Backups are the way back after a lost database: fully covered too.
        'src/services/backup/**': {
          100: true,
          perFile: true,
        },
      },
    },
  },
});
