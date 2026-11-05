import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

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
  plugins: [svelte(), devCspRelaxation()],
  build: {
    sourcemap: false,
  },
});
