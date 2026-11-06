# vocab-learner — Document de conception

> Statut : proposition v0 (2026-11-05), synthèse des agents architecte, game-dev et web-dev.

## 1. Vision

Petite appli **sans compte, hors ligne, sans pub ni tracking** pour qu'un enfant stocke son
vocabulaire **chinois** (hanzi + pinyin + traduction FR) et **anglais**, et s'entraîne :
flashcards, dictée audio, construction de phrases, mini-jeux. PC d'abord, téléphone ensuite.

### Principe directeur

**Gamifié comme les applis grand public (séries, XP, objectif du jour, parcours), mais sur le vocabulaire du cours en cours.**

- Le contenu ne vient pas de l'appli : c'est l'élève qui apporte **sa leçon de la semaine**.
- Le but est qu'il **maîtrise ce qu'on lui demande maintenant**, avant le contrôle, au lieu d'attendre la veille ou de suivre un programme générique.

### Public visé

- **Collégiens et lycéens français** qui apprennent le chinois, en particulier en **section internationale**, et l'anglais.
- **Premier utilisateur** : un élève de 3e en section internationale chinois.
- **Pour l'instant : France uniquement.** Interface et traductions en français, cadre légal français (RGPD + loi Informatique et Libertés, majorité numérique à 15 ans), vocabulaire du système scolaire (3e, seconde, ENT, contrôle).
- **Plus tard : ouverture internationale possible.** Tous les textes de l'interface sont dans `i18n/fr.json` dès le départ, et les langues des mots ne sont pas codées en dur (`language`). On pourra ajouter d'autres langues d'interface ou de traduction sans réécriture.
- L'appli doit être **utilisable par d'autres élèves sans rien installer côté serveur**. Le cœur (vocabulaire, entraînements, jeu) est **100 % local et gratuit**.
- Les fonctions cloud (photo) sont **optionnelles** et nécessitent un code d'accès (§7). Ainsi, l'appli publique ne coûte rien et ne collecte rien.

### Profil du premier utilisateur (oriente les priorités)

- Plus de 5 ans de chinois : **niveau avancé**, pas débutant.
- **Tape les hanzi au clavier** (IME chinois installé sur le PC).
- **Points faibles : l'oral et le vocabulaire.** Ce sont donc les priorités.

Conséquences :

- **L'audio d'abord.** Dans la plupart des exercices, on part du son, pas de l'écrit.
- **Pinyin masqué par défaut.** Il reste disponible en indice, mais ne doit pas servir de béquille.
- **Dictée tapée au clavier**, avec correction automatique immédiate et fiable, sans photo. La dictée papier corrigée par photo devient un complément.
- **Pas de mode débutant.** Pas d'ordre des traits en priorité, pas de jeux trop simples. Du volume de vocabulaire et de l'écoute en contexte (phrases, pas seulement des mots isolés).

## 2. Choix techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Type d'appli | **PWA** (installable PC + téléphone) | Un seul code, déploiement gratuit, hors ligne. Tauri/Flutter/Godot écartés (builds par plateforme, mauvaise saisie IME chinoise / TTS). |
| Front | **Vite + TypeScript + Svelte** | Léger, peu de boilerplate. |
| Stockage | **IndexedDB via Dexie**, `schemaVersion` + migrations | Local, sans serveur. `navigator.storage.persist()`. |
| Validation imports | **zod** | Imports JSON/CSV = entrée non fiable (OWASP). |
| Pinyin | **pinyin-pro** (MIT, offline) | Pinyin auto depuis les hanzi + conversion `ni3` → `nǐ`. Toujours éditable (polyphones 了, 长, 行…). |
| Répétition espacée | **ts-fsrs** | Algorithme moderne ; l'intervalle pilote aussi les stades du jardin (§5). |
| Voix | **Web Speech API** (`zh-CN`, `en-GB/US`) | Gratuit. Plan B : MP3 pré-générés en CI. |
| Ordre des traits | **hanzi-writer** (MIT ; données Arphic PL → joindre la licence) | Animation + mode quiz (tracer au doigt/souris). |
| Tests | Vitest (domaine en TDD) + Playwright (e2e) | |
| CI/CD | GitHub Actions : lint, typecheck, tests, `npm audit`, déploiement **GitHub Pages**, **release-please** (SemVer + CHANGELOG) | |
| Sécurité | CSP stricte, pas de `innerHTML` sur données utilisateur, Dependabot, lockfile, peu de dépendances | |

## 3. Modèle de données

```ts
Label         { id, name, color?, isFocus: boolean,                // "Leçon 7", "Animaux", "Verbes HSK 4"…
                examDate?: string,                                // ISO date of the next test, optional
                createdAt, updatedAt }
Card          { id, language: 'zh' | 'en', term, pinyin?, translation, example?,
                labelIds: string[],                               // many-to-many, Dexie multiEntry index *labelIds
                source: 'manual' | 'csv' | 'photo', createdAt, updatedAt }
ReviewState   { cardId, due, stability, difficulty, reps, lapses, lastReviewAt }  // FSRS, one per card
Session       { id, labelIds[], language, mode, startedAt, endedAt, results: SessionResult[] }
SessionResult { cardId, outcome: 'again'|'hard'|'good'|'easy'|'correct'|'wrong', answer? }
IgnoredTerm   { language, term }                                  // "je le connais déjà": never proposed again by text import
Progress      { xp, level, streakDays, bestStreak, unlocks[], lastActiveDate }
Settings      { voiceZh?, voiceEn?, ttsRate, dictationDelayMs,
                dailyGoalXp, photoCheckEnabled, speedGameEnabled }
```

**Profils (plusieurs élèves sur un même appareil, ex. un ordinateur familial) :**

- **Une base IndexedDB par profil** (`vocab-learner-<profileId>`), plus une petite base `profiles` (`{ id, displayName, avatar, createdAt }`).
- Isolation totale entre profils, sans `profileId` à propager dans tout le schéma. Un export correspond à un profil.
- Pas de mot de passe : ce n'est pas une frontière de sécurité, juste du confort.
- Le nom du profil est un **pseudo libre** ; aucun nom réel n'est demandé.

**Labels (plusieurs par mot) :**

Il n'y a **pas d'entité « cours » ou « leçon »** : seulement des **mots** et des **labels** (étiquettes libres). Un label peut représenter le vocabulaire d'un cours (« Leçon 7 »), un thème (« Animaux »), une liste officielle (« HSK 4 »)… L'appli ne fait aucune différence.

- Un mot est **unique** par couple `(language, term)` et peut porter **plusieurs labels**. Exemple : 猫 a les labels « Leçon 3 » et « Animaux ».
- Un label **n'a pas de langue** : « Animaux » peut regrouper 猫 et *cat*. Les entraînements filtrent par langue (onglet Chinois / Anglais).
- Sa progression (SRS, plante du jardin) appartient **au mot**, pas au label. Réviser 猫 via « Animaux » le fait aussi avancer dans « Leçon 3 ».
- À l'import, un mot déjà présent n'est **pas dupliqué**. On lui ajoute simplement le ou les labels choisis, après confirmation dans l'aperçu (« 3 mots existent déjà, labels ajoutés »).
- Les entraînements (flashcards, dictée, jeux) se lancent sur **un ou plusieurs labels** (ou sur tous les mots), sans doublon s'ils se chevauchent.
- Supprimer un label ne supprime pas ses mots. Un mot sans label reste visible dans « Tous les mots ».
- Un label se crée à la volée (saisie, import) et se renomme ou se fusionne avec un autre.

## 3 bis. Vocabulaire anglais

L'anglais est une **langue de plein droit** (`language: 'en'`), pas une simple option. Les mêmes labels, le même SRS, le même jardin (sur la parcelle anglaise) et les mêmes objectifs de contrôle s'appliquent.

Adaptations par exercice :

| Exercice | Chinois | Anglais |
|---|---|---|
| Carte | hanzi (+ pinyin en indice) / sens FR | mot / sens FR (+ phonétique optionnelle) |
| Dictée tapée | hanzi, comparaison exacte | orthographe, comparaison insensible à la casse, avec les variantes UK/US acceptées si saisies |
| Écoute | `ListenMeaning`, `ToneEcho` | `ListenMeaning`, paires proches (ship/sheep) à la place des tons |
| Voix | `zh-CN` | `en-GB` par défaut (programme scolaire FR), `en-US` en option |
| Saisie en lot | `你好 \| nǐ hǎo \| bonjour` | `apple \| pomme` (langue détectée automatiquement : présence de hanzi ou non) |

Une session porte sur **une seule langue** pour rester cohérente. L'accueil sépare les deux langues avec un onglet par langue ; un label mixte affiche ses mots chinois dans l'onglet Chinois et ses mots anglais dans l'onglet Anglais.

## 4. Arborescence

```
src/
  app/        routing, layout
  domain/     pure TS, 100 % TDD : srs, pinyin, answerCompare, dictationPlan,
              xp, mastery, events (SessionCompleted, CardMastered…)
  storage/    Dexie db, migrations, repositories, exportImport
  services/   tts (sélection de voix + repli), ocrClient
  features/   labels, cards, import (manual, csv, photo), flashcards, dictation, sentences, minigames, photoCheck, garden
  i18n/       fr.json  (all UI strings in one file, French only)
  ui/         composants partagés
worker/       Cloudflare Worker (proxy vision) — v1.4+
e2e/          Playwright
.github/workflows/
```

Le module `garden` (jeu) **s'abonne aux événements du domaine** : il ne modifie jamais la logique
d'apprentissage.

## 5. Labels « à travailler » et objectif contrôle (cœur du produit)

- **Labels à travailler** : l'élève épingle un ou plusieurs labels comme « à travailler » (`isFocus`), typiquement le label du vocabulaire de son cours actuel. L'accueil et la session du jour se concentrent **d'abord** sur eux, puis sur les révisions SRS des anciens mots.
- **Objectif contrôle** : si une date de contrôle (`examDate`) est saisie, l'appli planifie pour que tous les mots du label soient maîtrisés **avant** cette date.
  - Les intervalles SRS sont plafonnés pour que chaque mot soit revu dans les 1 à 2 jours qui précèdent le contrôle.
  - Le nombre de mots nouveaux par jour est calculé ainsi : `ceil(mots restants / jours restants)`.
  - Un compte à rebours s'affiche : « Contrôle dans 4 jours, 18/25 mots maîtrisés ».
- **Jauge de maîtrise par label** (% de mots au stade « tige » ou plus). C'est **l'indicateur principal** affiché, avant l'XP.
- **Parcours** : chaque label à travailler est un petit chemin d'étapes à débloquer :
  1. découvrir (flashcards) ;
  2. écouter ;
  3. reconnaître ;
  4. taper ;
  5. dictée ;
  6. phrases ;
  7. défi final.

  Une étape se termine quand ~80 % des mots y sont réussis. Le parcours garde le côté progression visible et satisfaisant des applis grand public, sans en copier l'apparence.
- Après le contrôle, le label est désépinglé et ses mots passent en « révision longue » (SRS normal) et les mots continuent de pousser dans le jardin.

## 5 bis. Côté jeu : « Île-Jardin »

> Détail complet (boucle de session, planification avant contrôle, économie, parcours, fiches des mini-jeux, écrans, événements, métriques d'équilibrage, `GameConfig`) : [`GAME_DESIGN.md`](GAME_DESIGN.md). En cas d'écart chiffré, ce document fait foi.

Chaque mot est une **graine** sur une île (parcelle chinoise + parcelle anglaise).
La plante grandit avec la maîtrise réelle : graine → pousse → tige (≥3 j) → bouton (≥7 j)
→ fleur (≥21 j) → lanterne (≥60 j). Un mot à réviser a **« soif »** : réviser = arroser.
Rien ne meurt, aucune perte de progression.

- **Session 5–15 min** : arrosage (flashcards SRS, ≤5 mots nouveaux) → mini-jeu → dictée ou atelier de phrases → retour au jardin.
- **XP** : barème détaillé dans [GAME_DESIGN.md §4](GAME_DESIGN.md). **Validé par l'autrice (2026-11-05)** : objectif du jour **300 XP** (réglable), XP ×0,5 au-delà puis ×0,25 au-delà du double ; défi final noté sur 20, réussi à **16/20** ; label **désépinglé automatiquement** le lendemain du contrôle (annulable).
- **Série** : 2 jours « brume » gelés par semaine, record conservé, jamais de culpabilisation.
- **Déblocages déterministes** affichés à l'avance (décor, lucioles tous les 10 mots en fleur). Pas de hasard, pas de classement, pas de notifications insistantes.
- **Mini-jeux** (souris/clavier ET tactile, cibles ≥44 px) :
  - `BridgeMatch` : relier hanzi ↔ sens/pinyin.
  - `ToneEcho` : entendre une syllabe, choisir le ton (touches 1–4).
  - `SentenceShuffle` : remettre une phrase dans l'ordre.
  - `TypeEcho` (plus tard) : écrire le mot entendu.
  - `SeasonRush` (plus tard, désactivable) : 60 s contre son propre record.
- **Dictée « Le Messager »** : XP pour avoir fini + bonus par mot juste ; les mots ratés passent en priorité dans le SRS ; un timbre par dictée.
- **Atelier de phrases** : utiliser des mots « en fleur » ; une phrase validée devient une banderole sur l'île.
- Rendu en **DOM/CSS + SVG** (pas de canvas), `prefers-reduced-motion` respecté.

## 6. Dictée

- **Deux modes de réponse :**
  - **Clavier (par défaut sur PC)** : l'enfant tape le mot en hanzi après l'avoir entendu. La correction est immédiate et automatique, avec une comparaison exacte des hanzi. Les erreurs vont en priorité dans le SRS.
  - **Papier** : l'enfant écrit sur une feuille, puis s'auto-corrige (✓/✗), ou corrige par photo plus tard (§7).
- **Gestion de l'IME** : ignorer les événements `compositionstart`/`compositionend` pour ne pas valider une saisie en cours, et ne valider que sur Entrée hors composition.
- Gros boutons : Lecture/Pause (Espace), Répéter (R), Précédent/Suivant (flèches), Stop.
- Vitesse en 3 crans (0.6 / 0.85 / 1.0). Délai automatique 3/5/8/12 s ou manuel, avec un anneau de compte à rebours.
- Répéter chaque mot 2× (option), ordre aléatoire, sous-ensemble de N mots.
- Mode enfant (seulement le numéro du mot) / mode parent (réponse visible). Pause automatique si l'onglet est caché.
- Pièges TTS : `getVoices()` est vide au départ (attendre `voiceschanged`). Sur iOS, enchaîner les mots via `onend` (pas de `setTimeout`). Sur Windows, les voix chinoises de qualité sont en ligne ; il faut donc un écran « tester la voix » + une aide pour installer le pack de langue.

## 6 bis. Entraînement à l'écoute (priorité oral)

Exercices « audio d'abord » sur ses mots :

| Exercice | Principe |
|---|---|
| `ListenMeaning` | Entendre un mot et choisir son sens parmi 4 propositions, avec des distracteurs de sa propre liste. |
| `ListenType` | Entendre un mot et le taper en hanzi (c'est la dictée en mode rapide). |
| `ToneEcho` | Distinguer les tons et les paires proches (shì/shí, mǎi/mài). |
| `SentenceListen` | Entendre une **phrase** qui contient un mot de la liste et répondre à une question simple, ou retrouver le mot entendu. Les phrases viennent des exemples saisis, ou sont générées plus tard. |
| Flashcard audio | Recto = son seul, verso = hanzi + sens. |

**Parler, mode « répète le mot »** : reconnaissance vocale du navigateur (`SpeechRecognition`, `zh-CN`). Règles **décidées** :

- **Désactivée par défaut.** Elle n'est activable que **sur demande explicite**, dans les Réglages, après un écran d'information : « ta voix est envoyée à Google/Microsoft ». Le consentement parental est requis pour les moins de 15 ans.
- L'activation est mémorisée **par profil**, et on peut la désactiver à tout moment.
- Tant qu'elle est désactivée, aucun appel à `SpeechRecognition` et aucune demande de micro.
- Elle n'est jamais nécessaire pour progresser : les étapes « parler » sont alors masquées, pas bloquantes.
- Prévue pour plus tard, pas dans le MVP.

## 7. Correction par photo

| Option | Fiabilité (écriture d'enfant) | Coût | Vie privée |
|---|---|---|---|
| Tesseract.js `chi_sim` (local) | Mauvaise : < 30–50 % en chinois | 0 | Parfaite |
| PaddleOCR ONNX (local) | Meilleure, mais lourde (dizaines de Mo) | 0 | Parfaite |
| **LLM vision (Claude) via proxy** | **~80–90 %** | quelques centimes/photo | Image envoyée au fournisseur |

**Décision :**
1. **MVP** : auto-correction guidée, sans OCR. Affichage des réponses + ✓/✗ d'un tap.
2. **v1.4** : option **désactivée par défaut**, activée par le parent :
   - **Côté client** : `<input capture="environment">`, recadrage sur la feuille, redimensionnement ~1500 px, suppression des EXIF, rien stocké.
   - **Proxy Cloudflare Worker** :
     - la clé API est un secret, jamais dans le client ;
     - code d'accès familial ;
     - limite de débit et taille maximale ;
     - CORS restreint ;
     - pas de log ;
     - plafond de dépenses chez le fournisseur.
   - **Transcription « à l'aveugle »** (sans la liste attendue), pour que le modèle ne « devine » pas des réponses justes. La comparaison se fait **localement** (`answerCompare`), puis le même écran ✓/✗ arrive **pré-rempli** et l'humain a le dernier mot.
3. En complément, hors cloud : le mode quiz de hanzi-writer (tracer à l'écran).

## 8. Import du vocabulaire

Trois façons d'importer. Toutes aboutissent au **même écran d'aperçu éditable** :

- choix du ou des labels à poser (existants ou nouveaux) ;
- signalement des doublons ;
- erreurs en rouge ;
- bouton « Ajouter N mots ».

1. **Manuelle** : formulaire mot par mot ou saisie en lot (ci-dessous).
2. **Fichier** : CSV ou JSON.
3. **Photo** d'une liste de vocabulaire (manuel scolaire, feuille de la prof, cahier). Voir §8.1.

### 8.1 Import par photo

Ce cas est **bien plus favorable** que la correction de dictée : le texte est souvent imprimé et propre, et une erreur se corrige dans l'aperçu avant l'enregistrement.

| Option | Imprimé | Manuscrit propre | Structure (colonnes hanzi / pinyin / sens) |
|---|---|---|---|
| Tesseract.js `chi_sim+eng` (local) | Correcte | Faible | À reconstruire soi-même, fragile |
| **LLM vision (Claude) via le Worker** | Très bonne | Bonne | **Renvoie directement du JSON structuré** |

**Décision :**

- **Moteur** : LLM vision via le même Cloudflare Worker que la correction de dictée. Le prompt demande un JSON `[{ term, pinyin?, translation? }]`.
- **Validation** : la réponse est validée par **zod** côté client, car c'est une sortie non fiable (OWASP).
- **Données manquantes** : le pinyin absent est complété par pinyin-pro et la traduction absente reste à remplir dans l'aperçu.
- **Mêmes protections que §7** : option activée par le parent, image recadrée, réduite et sans EXIF, rien conservé, code d'accès, plafond de dépenses.
- **Repli hors ligne / sans clé** : Tesseract.js local pour du texte imprimé, avec un résultat brut collé dans la saisie en lot.

### 8.2 Saisie en lot

Saisie en lot, une ligne par mot, séparateur `|`, tabulation ou `;`. Formats acceptés :

- `你好 | nǐ hǎo | bonjour`
- `你好 || bonjour` (pinyin auto)
- `谢谢 | xie4xie | merci` (`xie4xie` est converti en `xièxie`)
- `apple | pomme`

Un aperçu éditable s'affiche avant validation, avec les erreurs en rouge. Import/export CSV (UTF-8 BOM, pour Excel) et sauvegarde JSON.
Tons colorés (1 rouge, 2 vert, 3 bleu, 4 violet, neutre gris) **toujours doublés du diacritique**.
Polices système CJK. `lang="zh-CN"` sur les hanzi.

### 8.3 Partage de listes entre élèves

- **Pack de vocabulaire** : un fichier `.vocab.json` (mots + leurs labels, **sans** progression ni données personnelles), validé par zod à l'import.
- Usage : un élève ou un professeur prépare la liste de la leçon et la partage avec la classe, par fichier, ENT ou messagerie.
- **Plus tard** :
  - partage par lien, avec le pack encodé dans l'URL ou hébergé via le Worker ;
  - packs de référence fournis avec l'appli (ex. listes HSK), **uniquement s'ils sont sous licence compatible** (à vérifier).

### 8.4 Import depuis un texte : extraire les mots nouveaux

L'élève **colle un texte** (article, texte du manuel, paroles…) ou le **photographie**. L'appli en extrait les mots et ne propose que **ceux qui ne sont pas déjà dans sa liste**.

1. **Récupération du texte** :
   - copier-coller (hors ligne, gratuit) ;
   - ou photo, avec le même OCR que §8.1 : Tesseract local pour de l'imprimé, ou LLM vision via le Worker (option activée).
2. **Découpage en mots** :
   - **chinois** (pas d'espaces entre les mots) : `Intl.Segmenter('zh', { granularity: 'word' })`, intégré aux navigateurs, hors ligne, avec un dictionnaire ICU. Le découpage n'est pas parfait, donc l'élève peut **fusionner ou couper** un mot dans l'aperçu ;
   - **anglais** : `Intl.Segmenter('en')`, mise en minuscules, et regroupement simple des formes (pluriel, -ing, -ed) proposé mais modifiable.
3. **Filtrage** :
   - on retire la ponctuation, les nombres et les noms propres évidents ;
   - on retire **les mots déjà dans la liste** (`(language, term)` existant) ;
   - on retire les mots marqués « je le connais déjà » (`IgnoredTerm`) ;
   - option « masquer les mots très courants » (的, 了, 是, the, a…) via une petite liste embarquée.
4. **Aperçu** (même écran que les autres imports) :
   - chaque mot nouveau, avec son **nombre d'occurrences** et **la phrase du texte où il apparaît**. Cette phrase devient l'**exemple** de la carte (`example`), ce qui nourrit `SentenceListen` et l'atelier de phrases ;
   - le pinyin est automatique (pinyin-pro, en tenant compte du contexte) ;
   - le sens est à compléter. On peut le pré-remplir :
     - (a) hors ligne, plus tard, avec un dictionnaire libre chinois-français, par exemple CFDICT sous CC BY-SA (licence et couverture à vérifier, données distribuées à part avec attribution) ;
     - (b) avec l'option LLM du Worker, qui propose une traduction **dans le contexte de la phrase**, toujours modifiable.
   - Pour chaque mot, trois actions : ✓ ajouter, « je le connais déjà » (va dans `IgnoredTerm`), ou ignorer pour cette fois.
   - Le ou les labels sont posés sur tout le lot (ex. « Texte : la fête de la lune »).
5. **Sécurité** : le texte collé est traité **comme du texte brut**, jamais interprété comme du HTML. Sa taille est limitée (environ 20 000 caractères). Rien ne quitte l'appareil sans l'option cloud.

## 9. Synchro PC ↔ téléphone

- **MVP (0.3.0)** : sauvegarde locale complète, voir §9.1. Elle sert aussi au transfert PC → téléphone (Web Share API ou fichier).
- **Plus tard** : blob **chiffré de bout en bout** (AES-GCM, clé dérivée d'un code d'appairage) stocké via le même Worker. Pas de compte.

### 9.1 Sauvegarde et restauration locales (v0.3.0)

**But** : l'élève ne perd jamais son vocabulaire ni sa progression. IndexedDB peut être vidé : nettoyage du navigateur, purge iOS, changement de PC.

- **Contenu de la sauvegarde** : un fichier `vocab-learner-<pseudo>-<AAAA-MM-JJ>.vocab-backup.json` avec :
  - `format: "vocab-learner-backup"` et `schemaVersion` ;
  - date et version de l'appli ;
  - mots, labels, `IgnoredTerm` ;
  - **progression** : `ReviewState` (FSRS), historique des sessions, `Progress` (XP, niveau, série, déblocages), avancement des parcours ;
  - réglages ;
  - empreinte SHA-256 du contenu (WebCrypto) pour détecter un fichier abîmé.

  Elle ne contient ni photo, ni audio, ni secret.
- **Sauvegarder** : bouton « Sauvegarder sur cet appareil » qui télécharge le fichier (`Blob` + lien de téléchargement). Rien n'est envoyé sur Internet.
- **Sauvegarde automatique sur PC** (Chrome/Edge) : option « Choisir un dossier de sauvegarde » via la File System Access API. L'appli réécrit le fichier dans ce dossier après chaque session (un fichier par jour, les 7 derniers conservés). Le dossier peut être synchronisé (OneDrive…) si la famille le souhaite. Sur Firefox et Safari, sans cette API, il reste le téléchargement manuel.
- **Rappel** : bandeau discret si la dernière sauvegarde date de plus de 7 jours et que la progression a changé. On peut le désactiver.
- **Restaurer** : on choisit un fichier, puis :
  1. contrôle du format, du `schemaVersion` (migrations si plus ancien, refus si plus récent que l'appli) et de l'empreinte ;
  2. aperçu : « 312 mots, 9 labels, niveau 7, série 12 jours, sauvegardé le 05/11 » ;
  3. choix entre **Remplacer** (avec une sauvegarde automatique de l'état actuel juste avant) et **Fusionner**. Fusionner signifie : union des mots par `(language, term)` et des labels ; pour un même mot, on garde l'état FSRS le plus récent (`lastReviewAt`) ; l'XP et les déblocages prennent le maximum.
- **Sécurité (OWASP)** :
  - fichier = entrée non fiable : schéma **zod strict** (clés inconnues refusées, dont `__proto__`), tailles bornées (fichier ≤ 20 Mo, nombre d'éléments), caractères de contrôle refusés ;
  - écriture **atomique** en une transaction Dexie : tout ou rien ;
  - jamais de `eval` ni de HTML interprété.
- **Tests** :
  - aller-retour sauvegarde → restauration identique (propriété) ;
  - migrations de chaque `schemaVersion` ;
  - fusion (conflits FSRS, labels) ;
  - fichiers hostiles (tronqué, empreinte fausse, version future, énorme) ;
  - E2E : sauvegarder, vider la base, restaurer.

## 9 bis. Utilisateurs mineurs : vie privée et cadre légal

- **Pas de collecte par défaut** : pas de compte, pas d'analytics, pas de cookies, pas de pub. Les données restent sur l'appareil, donc il n'y a pas de traitement RGPD côté éditeur pour le cœur de l'appli.
- **Fonctions cloud (photo, et reconnaissance vocale si ajoutée)** : moins de 15 ans en France, donc **consentement parental** (RGPD art. 8, loi Informatique et Libertés art. 45).
  - Écran d'information clair avant activation.
  - Rien de conservé par le Worker.
  - Fournisseurs (Anthropic, Google, Microsoft) nommés dans une page « Confidentialité ».
- **Code d'accès aux fonctions cloud** : distribué par le responsable (parent ou professeur) qui paie l'API. Le Worker applique un quota par code. Sans code, les replis locaux s'appliquent.
- **Licence du code** : PolyForm Noncommercial 1.0.0, source disponible, revente interdite sans accord (voir §12). Mentions des licences tierces : Arphic pour hanzi-writer, etc.

## 9 ter. Suivi par le professeur (prévu, après la 1.0)

Le suivi se fait en deux étapes, pour livrer de la valeur sans back-end ni données personnelles côté serveur.

**Étape 1 (v1.7.0), sans serveur :**

1. **Côté élève** : bouton « Envoyer mon rapport » qui produit un fichier `report.vocab.json`. Ce fichier est signé avec un hash d'intégrité. Il ne contient pas une vraie signature, et ce n'est pas une preuve anti-triche.
2. **Contenu du rapport** :
   - pseudo ;
   - labels ;
   - % de maîtrise par label ;
   - mots difficiles ;
   - temps passé ;
   - date.

   Il ne contient ni photo ni audio.
3. **Transmission** : l'élève envoie le fichier lui-même, par l'ENT ou la messagerie. L'élève reste maître de ce qu'il transmet.
4. **Côté professeur** : un mode « Professeur » dans la même appli. Il importe les rapports de la classe, les données restent **dans son navigateur**, et il voit un tableau de bord avec :
   - maîtrise par élève et par leçon ;
   - mots ratés par toute la classe ;
   - élèves en retard avant le contrôle.

**Étape 2 (v2.0.0), espace classe en ligne :**

1. Le professeur crée une classe et publie les listes de la leçon. Les élèves les reçoivent automatiquement et leur progression remonte.
2. **Back-end nécessaire** :
   - comptes, idéalement connexion via l'ENT ou l'éducation nationale si possible ;
   - base de données hébergée **dans l'UE** ;
   - API authentifiée.
3. **Impact RGPD fort** (données de mineurs) :
   - l'établissement est responsable de traitement, l'éditeur est sous-traitant (contrat art. 28) ;
   - analyse d'impact (AIPD) ;
   - minimisation : pseudo, progression, aucune donnée sensible ;
   - durée de conservation limitée ;
   - droit à l'effacement.
4. **Sécurité (OWASP ASVS niveau 2)** :
   - contrôle d'accès strict entre classes, pour éviter les failles de type IDOR ;
   - limitation de débit ;
   - journalisation sans données personnelles ;
   - sauvegardes chiffrées.
5. **Coût d'hébergement** : à définir, il pourrait être couvert par une licence commerciale aux établissements (§12).

## 10. Jalons (SemVer)

> **Recalage (2026-11-06)** : la release `v0.1.0` contient le squelette **et** le contenu prévu en 0.2.0 ci-dessous (mots, labels, saisie en lot). La **0.2.0** termine la saisie (formulaire unitaire, aperçu éditable, gestion des labels, tons colorés). À partir de la **0.3.0**, la numérotation du tableau reste valable.

| Version | Contenu |
|---|---|
| 0.1.0 | Squelette Vite/Svelte/TS, CI (lint, typecheck, Vitest, audit), déploiement Pages, CSP |
| 0.2.0 | Mots et labels (plusieurs labels par mot), saisie manuelle et en lot, pinyin auto, dédoublonnage |
| 0.3.0 | Flashcards + SRS (FSRS), dont flashcard audio, pinyin masqué par défaut ; **sauvegarde et restauration locales du vocabulaire et de la progression** (§9.1) |
| 0.4.0 | Dictée vocale : réponse tapée en hanzi avec correction automatique, ou mode papier avec auto-correction ; **entraînement libre** (tous les mots, sans effet sur la planification FSRS) ; **explication de la file du jour** (mots à revoir demain, mots nouveaux en attente) ; **réglage du nombre de mots nouveaux par jour** (retour de test du 2026-11-06 : après une séance, plus aucun mot n'était proposé) |
| 0.5.0 | **Labels à travailler + objectif contrôle + jauge de maîtrise**, jardin minimal (stades, soif, XP, niveaux, série), `ListenMeaning` |
| 0.6.0 | Parcours par label (étapes à débloquer), exercices adaptés à l'anglais |
| 0.7.0 | PWA installable et hors ligne, import/export CSV, **import depuis un texte collé (mots nouveaux uniquement)**, packs partageables, profils multiples, page Confidentialité |
| **1.0.0** | **MVP stable** : schéma figé, migrations testées, testé sur PC + téléphone |
| 1.1.0 | `ToneEcho`, `SentenceListen`, `BridgeMatch` |
| 1.2.0 | Atelier de phrases, `SentenceShuffle`, vue parent |
| 1.3.0 | Répéter à voix haute (reconnaissance vocale, option), ordre des traits en bonus |
| 1.4.0 | Worker vision + **import par photo** : liste de vocabulaire (§8.1) et texte (§8.4), traduction suggérée en contexte |
| 1.5.0 | Correction de dictée par photo (réutilise le Worker) |
| 1.6.0 | Synchro chiffrée |
| 1.7.0 | **Suivi professeur, étape 1** : rapport de progression partageable + tableau de bord professeur local (§9 ter) |
| **2.0.0** | **Suivi professeur, étape 2** : espace classe en ligne avec comptes (§9 ter). Version majeure, car le back-end et le modèle de données changent. |

## 11. Risques

1. **Voix chinoise absente ou en ligne seulement** : détecter, guider le parent ; plan B MP3.
2. **Perte de données** (purge iOS) : `persist()`, rappels d'export, appli installée.
3. **Photos d'un mineur** : option désactivée par défaut, consentement, rien conservé.
4. **OCR non fiable** : jamais présenté comme vérité ; correction humaine finale.
5. **Abus de la clé API** : code d'accès, limite de débit, plafond de dépenses.
6. **Supply chain npm** : lockfile, Dependabot, audit en CI.
7. **Dérive du périmètre** : photo et jeux avancés hors MVP.

## 12. Questions ouvertes

- ~~Âge et niveau de l'enfant~~ : plus de 5 ans de chinois, tape les hanzi, faiblesses à l'oral et en vocabulaire.
- ~~« Oral »~~ : écoute en priorité ; parler via la reconnaissance vocale, **désactivée par défaut, activable uniquement sur demande**.
- ~~Licence~~ : **PolyForm Noncommercial 1.0.0**, retenue. Le projet est **source disponible**, pas « open source » au sens OSI.
  - **Usage non commercial libre** : réutilisation, modification et partage par des élèves, des professeurs, des établissements scolaires ou des associations.
  - **Usage commercial** (dont la revente) : uniquement avec l'accord de l'autrice, via une licence commerciale accordée au cas par cas.
  - Le fichier `LICENSE.md` contient le texte officiel, sans modification. Le README porte la mention « Commercial licensing: contact the author ».
  - **Contributions extérieures** : demander un accord de cession ou de licence (CLA léger) pour pouvoir continuer à accorder des licences commerciales.
  - **Dépendances tierces** (MIT, Arphic PL…) : compatibles. On garde leurs propres licences, listées dans `THIRD_PARTY_LICENSES`.
- ~~Suivi professeur~~ : **conservé**, après la 1.0 : rapport sans serveur en v1.7.0, espace classe en v2.0.0 (§9 ter).
- ~~« Version anglais »~~ : l'élève **apprend aussi du vocabulaire anglais** (§3 bis). **Interface en français uniquement.**
- ~~Traduction de référence~~ : **français uniquement**, pour le chinois comme pour l'anglais.
