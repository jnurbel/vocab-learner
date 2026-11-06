# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- One-word entry form: term, pinyin proposed automatically and editable (`ni3` converted to `nǐ`), meaning, optional example and labels (existing or new). An existing word is never duplicated: it only receives the missing labels.
- Editable bulk entry preview: correct the term, pinyin or meaning of a line, or exclude it; the import plan is recalculated and corrected lines are checked again.
- Edit a word from the word list (term, pinyin, meaning, example, labels); a new term that duplicates another word is refused. Delete a word after confirmation.
- Label management screen: labels in alphabetical order with their word count; rename, merge and delete (words are kept).
- Pinyin tones in colour (1 red, 2 green, 3 blue, 4 purple, neutral grey), always alongside the tone mark, with an AA contrast in light and dark themes; syllables written together are split.
- Persistent storage requested from the browser (`navigator.storage.persist()`) after the first save; a refusal or a missing API is silent.
- `THIRD_PARTY_LICENSES` with the licenses of pinyin-pro, zod and dexie, linked from the README.
- End-to-end tests of the one-word entry, word editing and deletion, and label management journeys.

### Changed

- pinyin-pro is loaded on demand, only when a Chinese word needs a pinyin: the initial JavaScript drops from 441.46 kB (195.32 kB gzip) to 182.64 kB (61.57 kB gzip), new screens included; pinyin-pro is a separate 287.49 kB (141.98 kB gzip) chunk.
- In the bulk entry, the label choice now comes after the preview, in the order of the task.

## [0.1.0] - 2026-11-06

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

[Unreleased]: https://github.com/jnurbel/vocab-learner/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jnurbel/vocab-learner/releases/tag/v0.1.0
