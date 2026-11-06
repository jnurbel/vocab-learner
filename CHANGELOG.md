# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 (2026-11-06)


### Added

* accept pipe, tab and semicolon separators in bulk entry ([0a41bcd](https://github.com/jnurbel/vocab-learner/commit/0a41bcd9a15bf4d7c8bee882ec73ef9cd0371db5))
* add label creation with name validation ([fea98d2](https://github.com/jnurbel/vocab-learner/commit/fea98d2e6e86a14d5261dda5b939d9155e1b58ac))
* add the bulk entry screen with a live import preview ([f13994e](https://github.com/jnurbel/vocab-learner/commit/f13994ed5dcf7a035ac4fa09c6d29db3aaddbcc2))
* add word and label management with bulk entry ([ed74371](https://github.com/jnurbel/vocab-learner/commit/ed743719bd89621c22d698acba64e29f0ff73dba))
* add word creation with required fields and length limits ([9215c9c](https://github.com/jnurbel/vocab-learner/commit/9215c9c65244b9d038cd4d52eee6c69e6c5491e0))
* bound pack sizes and reject control characters, unsafe ids and colors ([07826d7](https://github.com/jnurbel/vocab-learner/commit/07826d7f4513bda8cd1d800cf384b430c126a86f))
* bound the bulk entry input size and never throw on hostile text ([4eeab80](https://github.com/jnurbel/vocab-learner/commit/4eeab800382d5d23da7e19471dbfbe9f80ffaaf1))
* choose several existing labels or create one in the bulk entry ([568a354](https://github.com/jnurbel/vocab-learner/commit/568a354016806febebabae9a99453d8f2db8a28e))
* complete missing pinyin of Chinese words through an injected generator ([0e09e71](https://github.com/jnurbel/vocab-learner/commit/0e09e716485f1257ec81b7fe14a068a7445af18a))
* convert numbered pinyin to tone marks with the placement rule ([89c7505](https://github.com/jnurbel/vocab-learner/commit/89c75052d0e6b23279cf5b71da61b33b0aff54ac))
* create labels on the fly and reuse an existing name ([3d5e2de](https://github.com/jnurbel/vocab-learner/commit/3d5e2de9155371be6e2a8aef82ba7ee8a95cf4fb))
* generate pinyin offline with pinyin-pro ([674b464](https://github.com/jnurbel/vocab-learner/commit/674b4641da508a86d77f23ca68b8b2f4958d5004))
* handle neutral tones, u-umlaut spellings, capitals and syllabic nasals in pinyin ([38dc584](https://github.com/jnurbel/vocab-learner/commit/38dc58433bdc9b4ce86bb28a21fa3f3ce559f929))
* list words filtered by label and language ([81bd69a](https://github.com/jnurbel/vocab-learner/commit/81bd69a3208763a03bf1122ed3526e5f23dd3c95))
* merge and delete labels while keeping their words ([ead8fbb](https://github.com/jnurbel/vocab-learner/commit/ead8fbb8a90b8a3d44392395287ff0f1e4710ccb))
* parse bulk word entry lines with language detection ([4ff050f](https://github.com/jnurbel/vocab-learner/commit/4ff050f225be271f17d9372d9f2d06e043443c81))
* persist bulk-entered words from the home screen ([76b56b5](https://github.com/jnurbel/vocab-learner/commit/76b56b57019ceb799312f2d0005d5030cd69e49a))
* plan an import into new words, labelled existing words and errors ([0a9c614](https://github.com/jnurbel/vocab-learner/commit/0a9c614bdfb7ea62b7fe95481adc84e207643d32))
* reject packs with unknown labels, duplicate label ids or duplicate words ([d2e2529](https://github.com/jnurbel/vocab-learner/commit/d2e252962ab122715e89a83c0ffd1bed7e45c38a))
* rename a label while keeping label names unique ([36b4392](https://github.com/jnurbel/vocab-learner/commit/36b43921a7b236cf46bda9016d672a233ab7fa6e))
* report bulk entry errors per line, including duplicates in the batch ([794ff95](https://github.com/jnurbel/vocab-learner/commit/794ff95dd10c4ba1c9b5a3b841d3c3a631bf507a))
* save the label created during an import in the same transaction ([47779a1](https://github.com/jnurbel/vocab-learner/commit/47779a120b30ab17020e3922355b7a52d58121ba))
* select the words of one or more labels, once each, by language ([2a0d05e](https://github.com/jnurbel/vocab-learner/commit/2a0d05ee8cad489b448f959adff46b4bfac607d8))
* show the persisted word list under the bulk entry ([48e1822](https://github.com/jnurbel/vocab-learner/commit/48e1822058f59a76274e7244abaea8f6fdd2a4bd))
* store words and labels in IndexedDB with a multiEntry label index ([e49bc72](https://github.com/jnurbel/vocab-learner/commit/e49bc7212be805235af0d80a854a0ad86ff362f8))
* turn a confirmed import plan into cards to create and update ([69d758a](https://github.com/jnurbel/vocab-learner/commit/69d758ab14a3e34243743e677f03a9cb31f4e485))
* validate shared vocabulary packs with zod ([c290287](https://github.com/jnurbel/vocab-learner/commit/c2902870ac2c3211f2e7215fc4a11fcd1014bee3))


### Fixed

* deduplicate selected words by id rather than by object identity ([aa45045](https://github.com/jnurbel/vocab-learner/commit/aa4504536ba6910aec91afa1f7a18f68b45bd3b5))


### CI

* automate releases with release-please on master ([f45487c](https://github.com/jnurbel/vocab-learner/commit/f45487c8765693006614055cf6aca8b8ca55dc69))

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
