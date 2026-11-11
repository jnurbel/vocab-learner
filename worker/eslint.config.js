import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import security from 'eslint-plugin-security';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['coverage/', '.wrangler/']),
  js.configs.recommended,
  ts.configs.strictTypeChecked,
  ts.configs.stylisticTypeChecked,
  security.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.serviceworker },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.js', 'scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Code execution from strings.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Too noisy with TypeScript index access; noUncheckedIndexedAccess covers the typing side.
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.mjs', 'test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
