import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import security from 'eslint-plugin-security';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

/** DOM sinks that turn strings into markup or code (OWASP A03: injection / XSS). */
const forbiddenHtmlSinks = [
  {
    selector: 'AssignmentExpression > MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
    message: 'Do not assign HTML strings: build DOM nodes or use Svelte markup instead.',
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: 'insertAdjacentHTML is an XSS sink: use Svelte markup instead.',
  },
  {
    selector:
      "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: 'document.write is forbidden.',
  },
];

export default defineConfig(
  // worker/ is a separate project (Cloudflare Worker) with its own ESLint config.
  globalIgnores(['dist/', 'coverage/', 'playwright-report/', 'test-results/', 'worker/']),
  js.configs.recommended,
  ts.configs.strictTypeChecked,
  ts.configs.stylisticTypeChecked,
  svelte.configs.recommended,
  security.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      // Code execution from strings.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-syntax': ['error', ...forbiddenHtmlSinks],
      // Raw HTML in Svelte templates bypasses escaping.
      'svelte/no-at-html-tags': 'error',
      'svelte/no-target-blank': 'error',
      // Too noisy with TypeScript index access; noUncheckedIndexedAccess covers the typing side.
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    files: ['*.config.{js,ts}', 'e2e/**/*.ts', 'config/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
