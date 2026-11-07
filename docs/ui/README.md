# Maquettes d'interface — style « Encre & Jade »

Référence visuelle validée par l'autrice (2026-11-05). Les fichiers de `mockups/` sont exportés de la page
de maquettes (format `.dc.html` : HTML + styles en ligne). Ce sont des **références**, pas du code de
l'appli : ils utilisent des styles en ligne et Google Fonts, interdits par la CSP de l'appli. Il faut en
reprendre l'apparence avec des classes CSS et des jetons (`src/ui/theme.css`).

## Écrans

| Fichier | Écran | Version où l'écran existe |
|---|---|---|
| `Main.dc.html` | Accueil PC : label à travailler, contrôle, jauge, objectif du jour, série, niveau, labels | 0.5.0 |
| `Mobile.dc.html` | Accueil téléphone (390 × 844) | 0.7.0 |
| `Parcours.dc.html` | Parcours d'un label (7 étapes) | 0.6.0 |
| `Dictee.dc.html` | Dictée tapée | 0.4.0 |
| `ExListenTypeWrong.dc.html` | Dictée : « bon son, mauvais caractère » + diff | 0.4.0 |
| `Import.dc.html` | Import en lot, aperçu, labels à poser | 0.2.0 (onglets texte 0.7.0, photo 1.4.0) |
| `Jardin.dc.html` | Île-Jardin (parcelles zh / en, stades, soif) | 0.5.0 |
| `ExListenMeaning.dc.html` | Mini-jeu : écouter et choisir le sens | 0.5.0 |
| `SessionSummary.dc.html` | Bilan de séance | 0.5.0 |
| `ExToneEcho.dc.html` | Tons, paire minimale, erreur | 1.1.0 |
| `FinalChallenge.dc.html` | Défi final « pas encore » | 0.6.0 |

## Jetons du thème (à reprendre dans `src/ui/theme.css`)

| Jeton | Clair | Usage |
|---|---|---|
| `--bg` | `#F6F4EE` | fond papier |
| `--surface` | `#FFFFFF` | cartes |
| `--line` | `#E3DFD5` | bordures |
| `--ink` | `#1E2A2F` | texte, boutons sombres |
| `--muted` | `#5B6770` | texte secondaire |
| `--jade` / `--jade-strong` / `--jade-soft` | `#17705A` / `#0F4F3F` / `#E3F1EC` | accent, réussite, jauges |
| `--seal` / `--seal-soft` | `#8E2F1C` / `#FCEEE9` | contrôle, compte à rebours |
| `--ochre` / `--ochre-soft` | `#8A3D0B` / `#FBE7D8` | erreur (jamais la couleur seule) |
| `--thirst` / `--thirst-soft` | `#7A4A00` / `#FFF3DC` | soif |

Rayons : 10–14 px (boutons), 16–24 px (cartes). Cibles tactiles ≥ 44 px. Thème sombre à dériver
(contraste AA vérifié par test, comme pour les tons).

**Polices** : la CSP interdit Google Fonts. Interface : Plus Jakarta Sans **auto-hébergée** (woff2,
licence OFL à joindre) ou repli système. Hanzi : polices système (`"Microsoft YaHei", "PingFang SC",
"Noto Sans SC", sans-serif`) — Noto Sans SC complète pèse plusieurs Mo.
