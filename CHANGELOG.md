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
