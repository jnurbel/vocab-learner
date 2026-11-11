# vocab-learner

Application gratuite et gamifiée pour **maîtriser le vocabulaire de la leçon en cours** en **chinois** et en **anglais**.
Elle s'adresse aux collégiens et lycéens français, notamment en section internationale.

- Flashcards avec répétition espacée.
- Dictée audio, avec pause entre les mots.
- Entraînement à l'écoute.
- Phrases à construire.
- Objectif « contrôle » : tous les mots maîtrisés avant la date du contrôle.
- Un jardin qui grandit avec la maîtrise réelle des mots.
- Sans compte, sans publicité, sans pistage. Les données restent sur l'appareil.
- PC d'abord, téléphone ensuite (application web installable, PWA).

> 🚧 Projet en conception. Voir [docs/DESIGN.md](docs/DESIGN.md).

## Développement

### Prérequis

- Node.js LTS (version dans [`.nvmrc`](.nvmrc), actuellement 26) et npm.
- Git. Les fins de ligne sont normalisées en LF (`.gitattributes`).

`.npmrc` désactive les scripts d'installation des dépendances (`ignore-scripts=true`), par sécurité.

### Installation

```sh
npm ci
npx playwright install chromium   # une fois, pour les tests E2E
git config core.hooksPath .githooks   # optionnel : vérifie les messages de commit en local
```

### Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (http://localhost:5173/vocab-learner/) |
| `npm test` | Tests unitaires et de composants (Vitest) |
| `npm run test:watch` | Vitest en mode watch, pour le cycle TDD |
| `npm run test:coverage` | Tests + couverture v8 (100 % exigé sur `src/domain/**`) |
| `npm run test:e2e` | Build de production puis tests Playwright (Chromium) |
| `npm run lint` | ESLint + vérification Prettier |
| `npm run format` | Formatage Prettier |
| `npm run typecheck` | `svelte-check` + `tsc` |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Sert le build de production |

### Organisation

- `src/domain/` : logique métier pure, écrite en TDD (tests `*.test.ts` à côté du code).
- `src/app/`, `src/features/`, `src/ui/` : interface Svelte ; `src/storage/` : IndexedDB ; `src/services/` : voix, etc.
- `src/i18n/fr.json` : tous les textes de l'interface.
- `e2e/` : tests Playwright, lancés sur le build de production.

### Sécurité front

- CSP stricte dans `index.html` (pas de script ni de style inline). Le serveur de dev l'assouplit à la volée, jamais le build.
- Conséquence : pas d'attribut `style="..."` dans les composants (bloqué par la CSP) ; utiliser des classes ou la directive `style:`.
- Interdits par ESLint : `{@html}`, `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`.

### Appli installable et hors ligne (PWA)

- `vite-plugin-pwa` en mode `generateSW` : `dist/sw.js` et le runtime Workbox sont servis depuis `'self'` (`worker-src 'self'`), le manifeste aussi (`manifest-src 'self'`). L'enregistrement est dans le bundle (`src/main.ts`), sans script inline : la CSP n'a pas changé.
- Précache : toute l'appli, la police auto-hébergée, les icônes et le chunk pinyin-pro (pinyin automatique hors ligne).
- Mises à jour en mode « prompt » : la nouvelle version attend le clic sur « Mettre à jour », jamais pendant une séance.
- Service worker désactivé par `npm run dev` et dans Vitest ; `npm run build && npm run preview` pour l'essayer.
- Icônes dessinées à partir du logo 词 dans `public/icons/` : `UPDATE_ICONS=1 npx playwright test icons` pour les redessiner.

### CI/CD

- `ci.yml` (PR et push sur `dev`/`master`) : lint, typecheck, tests + couverture, build, E2E, `npm audit`, gitleaks, commitlint.
- `deploy.yml` : déploiement GitHub Pages depuis `master`.
- `release.yml` : release-please sur `master` (version SemVer, tag `vX.Y.Z`, CHANGELOG).

## Licence

Code **source disponible** sous [PolyForm Noncommercial 1.0.0](LICENSE.md) :

- **Libre pour tout usage non commercial** : élèves, familles, professeurs, établissements scolaires, associations.
- **Usage commercial, y compris la revente** : uniquement avec l'accord de l'autrice. Pour une licence commerciale, contacter l'autrice (voir [NOTICE](NOTICE)).

Les bibliothèques tierces gardent leur propre licence : pinyin-pro (MIT), zod (MIT), dexie (Apache-2.0) et Workbox (MIT, service worker). Textes complets dans [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md).
