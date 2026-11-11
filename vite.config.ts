import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { paddleAssets } from './config/paddleAssets.ts';
import packageJson from './package.json' with { type: 'json' };
import { manifestColors, webManifest } from './src/app/webManifest.ts';
import { themeTokens } from './src/ui/contrast.ts';

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

/**
 * Installable and offline (DESIGN §2, 0.8.0). `generateSW` writes a Workbox service worker
 * served from 'self' (CSP `worker-src 'self'`), with no inline script: the registration is
 * bundled with the app (`injectRegister: false`, see src/main.ts). "prompt": a new version
 * waits for the user's click, never reloads the app during a session. Off on the dev server.
 */
function progressiveWebApp() {
  const theme = themeTokens(readFileSync(new URL('./src/ui/theme.css', import.meta.url), 'utf8'));
  return VitePWA({
    strategies: 'generateSW',
    registerType: 'prompt',
    injectRegister: false,
    filename: 'sw.js',
    manifestFilename: 'manifest.webmanifest',
    includeAssets: ['favicon.svg', 'icons/apple-touch-icon-180.png'],
    manifest: webManifest('/vocab-learner/', manifestColors(theme.light)),
    workbox: {
      // The app, its self-hosted font, the icons, and the pinyin-pro chunk loaded on demand,
      // so that the automatic pinyin works offline too.
      globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
      // The on-device photo reader (PaddleOCR models, runtime, worker and dictionary, ~48 MB) is
      // not precached: most learners never open it. Its files are kept on first use instead, so
      // that a photo read once online can be read again offline.
      globIgnores: ['paddle/**'],
      runtimeCaching: [
        {
          urlPattern: /\/vocab-learner\/paddle\//,
          handler: 'CacheFirst',
          options: {
            // Unhashed model names: a new reader version gets a cache of its own.
            cacheName: `paddle-ocr-${packageJson.dependencies['ppu-paddle-ocr']}-${packageJson.dependencies['onnxruntime-web']}`,
            expiration: { maxEntries: 20 },
          },
        },
      ],
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
      sourcemap: false,
    },
    devOptions: { enabled: false },
  });
}

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/vocab-learner/
  base: '/vocab-learner/',
  plugins: [svelte(), svelteTesting(), devCspRelaxation(), progressiveWebApp(), paddleAssets()],
  resolve: {
    // PaddleOCR imports onnxruntime-web: take its WebAssembly-only build, without WebGPU/WebGL,
    // so that the reader fetches a single runtime file.
    alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }],
  },
  worker: {
    format: 'es',
    // The photo reader worker goes with the reader's files, cached on first use, not precached.
    rollupOptions: {
      output: {
        entryFileNames: 'paddle/[name]-[hash].js',
        chunkFileNames: 'paddle/[name]-[hash].js',
      },
    },
  },
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
        // Install, offline and update logic of the PWA: fully covered as well.
        'src/services/pwa/**': {
          100: true,
          perFile: true,
        },
      },
    },
  },
});
