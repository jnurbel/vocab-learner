# Contribuer à vocab-learner

## Conventions

- **Code en anglais** : identifiants, noms de fichiers, commentaires, logs, messages d'erreur, noms de tests.
- **Commits** : en anglais, au format [Conventional Commits](https://www.conventionalcommits.org/), à l'impératif. Exemples : `feat: add bulk word entry`, `fix: keep IME composition from submitting`.
- **Versions** : [SemVer](https://semver.org/) `X.Y.Z`, tags `vX.Y.Z`, [CHANGELOG.md](CHANGELOG.md) au format Keep a Changelog. La version découle des commits :
  - `feat` → MINOR ;
  - `fix` → PATCH ;
  - `!` ou `BREAKING CHANGE` → MAJOR.
- **TDD** : le test d'abord (Red → Green → Refactor). La logique métier (`src/domain/`) est couverte à 100 %.
- **Sécurité** : OWASP Top 10 / ASVS. Aucune donnée utilisateur injectée en HTML, imports validés, aucun secret dans le dépôt.

## Branches

| Branche | Rôle |
|---|---|
| `master` | Releases uniquement (tags `vX.Y.Z`) |
| `dev` | Intégration continue, version « snapshot » |
| `feature-<nom-de-la-feature>` | Nouvelle fonctionnalité, partie de `dev` |
| `fix-<id-ou-nom-du-bug>` | Correction, partie de `dev` |

Le flux : `feature-*` / `fix-*` → PR vers `dev` (CI verte obligatoire) → PR `dev` → `master` pour une release.

## Accord de contribution

Le projet est sous **PolyForm Noncommercial 1.0.0**. L'autrice accorde aussi des licences commerciales au cas par cas, et pourra plus tard passer le projet sous une licence plus permissive (par exemple MIT).

En proposant une contribution (pull request, patch), vous acceptez ce qui suit :

1. Vous êtes l'auteur de la contribution, ou vous avez le droit de la soumettre.
2. Vous accordez à l'autrice du projet une licence **perpétuelle, mondiale, non exclusive, gratuite et irrévocable** pour utiliser, modifier, distribuer et **re-licencier** votre contribution, sous toute licence, y compris commerciale.
3. Votre contribution est publiée dans le projet sous la licence en vigueur du projet.

Indiquez votre accord en ajoutant la ligne suivante à chaque commit (`git commit -s`) :

```
Signed-off-by: Votre Nom <email>
```
