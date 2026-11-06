# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0](https://github.com/jnurbel/vocab-learner/compare/v0.1.0...v0.2.0) (2026-11-06)


### Added

* ask the browser for persistent storage after the first save ([2e1d0c4](https://github.com/jnurbel/vocab-learner/commit/2e1d0c473e3a7bea3f9dbd8988d75f86df0c7696))
* colour pinyin syllables by tone, always alongside the tone mark ([a3e92d9](https://github.com/jnurbel/vocab-learner/commit/a3e92d922f0bcc05c8a880e6eb74c5d26cc81388))
* complete word entry, label management and tone colorsFeature entry completion ([d0baf43](https://github.com/jnurbel/vocab-learner/commit/d0baf4333bc5159a3fb893ceea44e8c06ddc6a0f))
* correct or exclude bulk entry lines in an editable preview ([36669e5](https://github.com/jnurbel/vocab-learner/commit/36669e5498879dbecfa38af86cb7feae5540c595))
* correct the term, pinyin or meaning of a bulk entry line before saving ([2dedf50](https://github.com/jnurbel/vocab-learner/commit/2dedf5022c9b0423f9e47dc09af648adf9c761d0))
* count the words of each label in alphabetical order ([387df52](https://github.com/jnurbel/vocab-learner/commit/387df524ac2b05671c9fa8e8ff5e6495a6b0ecda))
* delete a word from storage ([798af80](https://github.com/jnurbel/vocab-learner/commit/798af80608b4b5315721167b52d85235c66b6b6b))
* edit a word and refuse a new term that duplicates another word ([3e41016](https://github.com/jnurbel/vocab-learner/commit/3e410166c4bd38b5a9ff84c2dc04cedafe4de5c9))
* edit or delete a word from the word list, deletion confirmed first ([7ea6aa8](https://github.com/jnurbel/vocab-learner/commit/7ea6aa8f61b45da0e17cc4d0a35aadd342f3444b))
* enter one word at a time with a proposed, editable pinyin ([6d650e0](https://github.com/jnurbel/vocab-learner/commit/6d650e086b2d6af7283f84c48abd273362667794))
* exclude a bulk entry line and re-check corrected lines for errors and duplicates ([bb8c712](https://github.com/jnurbel/vocab-learner/commit/bb8c7124172a9d2bc875d6140c2fdd80c5b71383))
* give an existing word only the missing labels instead of duplicating it ([e8d367e](https://github.com/jnurbel/vocab-learner/commit/e8d367e9602f6c1fb2391755e39ac3485c36237e))
* load the pinyin generator lazily and only once ([eb0eee0](https://github.com/jnurbel/vocab-learner/commit/eb0eee003911890ebae556f78d14ea1c7fabdb3e))
* manage labels with their word count: rename, merge and delete ([fa580e9](https://github.com/jnurbel/vocab-learner/commit/fa580e9c6d437462d6e5bd32cf25e9433f2de3d7))
* open a word for editing from the list and delete it after confirmation ([b147c75](https://github.com/jnurbel/vocab-learner/commit/b147c75ade2649fa18ff8a76071f62da7074b913))
* plan the entry of a single new word with converted pinyin ([1dc2bb4](https://github.com/jnurbel/vocab-learner/commit/1dc2bb4269ee603fdd81b1d9ec1f54a8daffb7a9))
* read the tone of each space-separated pinyin syllable ([320d4bc](https://github.com/jnurbel/vocab-learner/commit/320d4bceca7e07912bf9ec025c25ac325630e1a3))
* resolve ticked and typed labels in one domain function shared by entry forms ([54ead86](https://github.com/jnurbel/vocab-learner/commit/54ead86d5134ab178157d005aae69f601e25c1e5))
* split glued pinyin into syllables with their tone, ü, ê and erhua included ([a0b8c8f](https://github.com/jnurbel/vocab-learner/commit/a0b8c8fd4567780b9385242a7a970607e5ecc0b3))
* validate the one-word form and ignore pinyin on English words ([5a93bce](https://github.com/jnurbel/vocab-learner/commit/5a93bce5d79f6404297f0cc355d9639fa5d62cd2))


### Fixed

* keep stored words and labels as plain objects so that IndexedDB can clone them ([bf2aa35](https://github.com/jnurbel/vocab-learner/commit/bf2aa35cf8c7d6fca83904fe8ed21f3fa269b76c))


### Changed

* fetch pinyin-pro only when a Chinese word needs a pinyin ([aaca5a6](https://github.com/jnurbel/vocab-learner/commit/aaca5a6006ce72ff13a8f2fd894b0b429542ddcd))

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
