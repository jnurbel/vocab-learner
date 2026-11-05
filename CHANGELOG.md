# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Design document (`docs/DESIGN.md`).
- PolyForm Noncommercial 1.0.0 license, notice and contribution agreement.
- Vite + Svelte 5 + strict TypeScript project skeleton with the source tree from the design document.
- Strict Content Security Policy in `index.html`.
- Unit and component tests with Vitest, Testing Library and v8 coverage (100% required on `src/domain`).
- Playwright smoke test against the production build.
- ESLint (typescript-eslint, eslint-plugin-svelte, security rules), Prettier and commitlint.
- GitHub Actions: CI (lint, typecheck, tests, build, E2E, npm audit, gitleaks, commitlint), GitHub Pages deployment and release-please.
- Dependabot for npm and GitHub Actions.
- Words (`Card`) and free labels (`Label`), many-to-many, with creation and validation (required term and meaning, length limits, unique labels per word).
- Word identity by `(language, term)`, Unicode-normalized and case-insensitive for English.
- Numbered pinyin to tone marks (`ni3 hao3` → `nǐ hǎo`, `lv4` / `lu:4` → `lǜ`, neutral tone 5 or 0), with the standard placement rule.
- Bulk word entry parser: one word per line, `|`, tab or `;` separators, Chinese or English detected from hanzi, per-line errors with line numbers, input size limits.
- Offline pinyin generation from hanzi with pinyin-pro, behind a replaceable generator.
- Import plan: new words, existing words that only receive the chosen labels (no duplicates), and errors, ready for the preview.
- Label operations: create on the fly, rename, merge (words keep the union of their labels) and delete (words are kept); selection of the words of one or more labels, once each, by language.
- Validation of shared vocabulary packs with zod: strict schema, size limits, control and bidi characters rejected, safe ids and colors, consistency checks.
- IndexedDB storage with Dexie: words and labels repository, unique `(language, term)` index, multiEntry `*labelIds` index, atomic imports.
- Bulk entry screen: paste a list, live preview (new words, existing words, errors per line), choose existing labels or create one, add the words.
- Word list filtered by label and by language, persisted across reloads.
- End-to-end test of the bulk entry journey on the production build.

### Dependencies

- pinyin-pro (MIT), zod (MIT), dexie (Apache-2.0); fake-indexeddb (Apache-2.0) for tests.
