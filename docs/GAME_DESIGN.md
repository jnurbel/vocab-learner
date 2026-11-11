# vocab-learner — Document de game design détaillé

> Statut : proposition v0 (2026-11-05). Complète le §5 bis de [`DESIGN.md`](DESIGN.md) (« Île-Jardin »).
> Ce document est la **spécification du module jeu** : il doit permettre d'écrire les tests (Vitest, TDD) avant le code.
> En cas d'écart chiffré avec `DESIGN.md`, **ce document fait foi** (les écarts sont listés au §12).

## Sommaire

0. [Conventions](#0-conventions)
1. [Boucle de session](#1-boucle-de-session)
2. [Planification avec date de contrôle](#2-planification-avec-date-de-contrôle)
3. [Stades de la plante, soif et jauge de maîtrise](#3-stades-de-la-plante-soif-et-jauge-de-maîtrise)
4. [Économie : XP, objectif du jour, niveaux, série, déblocages](#4-économie)
5. [Parcours par label](#5-parcours-par-label)
6. [Fiches des mini-jeux](#6-fiches-des-mini-jeux)
7. [Retours et « juice »](#7-retours-et-juice)
8. [Écrans à maquetter](#8-écrans-à-maquetter)
9. [Événements du domaine et machines à états](#9-événements-du-domaine-et-machines-à-états)
10. [Métriques d'équilibrage et cas limites](#10-métriques-déquilibrage-et-cas-limites)
11. [`GameConfig` : toutes les constantes](#11-gameconfig--toutes-les-constantes)
12. [Décisions prises dans ce document](#12-décisions-prises-dans-ce-document)

---

## 0. Conventions

### 0.1 Principes de design (rappel, non négociables)

- **Le contenu, ce sont les mots de l'élève.** Le jeu habille l'apprentissage, il ne le remplace pas. Le module `garden` **s'abonne aux événements du domaine** et ne modifie jamais la logique SRS.
- **L'audio d'abord.** Dans la majorité des exercices, la question est un son. Le pinyin est masqué par défaut et compte comme un indice.
- **Honnête et non manipulateur.** Pas de hasard (ni loot, ni coffre), pas de classement, pas de perte de progression, pas de notification insistante, pas de monnaie, pas de « dernière chance ». Les récompenses sont **cosmétiques et annoncées à l'avance**. Aucune fonction d'apprentissage n'est verrouillée derrière l'XP.
- **Ton 13–18 ans.** Phrases courtes, tutoiement, factuel, un peu d'humour sec. Pas de mascotte qui supplie, pas de « Bravo champion ! ». Exemples : « Juste. », « Presque : c'était 词语. », « 18/25 mots maîtrisés. Contrôle jeudi. »
- **Rien ne dépend de la reconnaissance vocale** (désactivée par défaut, cf. `DESIGN.md` §6 bis).
- **Rendu DOM/CSS + SVG**, pas de canvas ; CSP stricte (pas de style inline injecté depuis des données utilisateur, pas d'`eval`) ; `prefers-reduced-motion` respecté.

### 0.2 Boucle des 10 secondes

Ce que l'élève fait en continu, et ce qui doit être agréable :

1. **Il entend** un mot ou une phrase (TTS).
2. **Il répond** : clic sur une option, chiffre au clavier, ou saisie au clavier (IME chinois).
3. **Retour immédiat** (< 100 ms) : couleur + icône + texte + son court, et le mot complet (hanzi, pinyin, sens) s'affiche.
4. **La plante réagit** : une goutte tombe sur la mini-plante en haut de l'écran.

La satisfaction vient de la **précision** (« je l'ai reconnu à l'oreille »), du **rythme** (pas d'attente inutile) et de la **trace visible** (la jauge du label monte, les plantes grandissent). La boucle longue (jour / semaine) vient de la jauge de maîtrise, du parcours, du compte à rebours avant le contrôle et du jardin.

### 0.3 Jour local

- Un **jour** commence à `dayStartHour` = **4 h** heure locale. Une session à 0 h 30 compte pour la veille (les ados révisent tard).
- `localDay(now)` renvoie une chaîne `YYYY-MM-DD`. Toutes les règles « par jour » utilisent cette fonction.
- **Horloge qui recule** (changement d'heure, horloge modifiée) : `today = max(localDay(now), progress.lastActiveDate)`. On ne retire jamais rien.

### 0.4 Hasard déterministe

Tout tirage (ordre des items, distracteurs, mélange de phrases) passe par un générateur pseudo-aléatoire **à graine** (`createRng(seed)`, par ex. mulberry32). La graine est dérivée de `sessionId` + index de l'item. Les tests fixent la graine. Ce hasard sert à varier les exercices, **jamais à attribuer une récompense**.

### 0.5 Identifiants proposés

| Concept | Identifiant |
|---|---|
| Stades | `Stage = 'seed' \| 'sprout' \| 'stem' \| 'bud' \| 'flower' \| 'lantern'` |
| Exercices | `ExerciseType = 'discovery' \| 'audioFlashcard' \| 'listenMeaning' \| 'listenType' \| 'toneEcho' \| 'bridgeMatch' \| 'sentenceListen' \| 'sentenceShuffle' \| 'typeEcho' \| 'seasonRush'` |
| Résultat d'une réponse | `Outcome = 'correct' \| 'correctWithHint' \| 'almost' \| 'wrong'` |
| Note FSRS | `Rating = 'again' \| 'hard' \| 'good' \| 'easy'` |
| Étapes du parcours | `PathStep = 'discover' \| 'listen' \| 'recognize' \| 'type' \| 'dictation' \| 'sentences' \| 'finalChallenge'` |
| Phases de session | `SessionPhase = 'watering' \| 'newSeeds' \| 'miniGame' \| 'messenger' \| 'summary'` |

### 0.6 Extensions du modèle de données proposées

Le module jeu a besoin de quelques champs en plus du §3 de `DESIGN.md` (à intégrer avec une migration Dexie) :

```ts
ReviewState  += { successDays: number,          // distinct local days with at least one correct answer
                  lastSuccessDay?: string,      // 'YYYY-MM-DD'
                  lastRatedDay?: string,        // day of the last FSRS update (one FSRS update per card per day)
                  peakStage: Stage }            // highest stage ever reached (never decreases)
SessionResult = { cardId, exercise: ExerciseType, outcome: Outcome, rating?: Rating,
                  hintsUsed: number, responseMs: number, answer?: string, at }
SessionDraft  { sessionId, day, plan: SessionPlan, cursor: number, relearnQueue: string[] } // resume support
PathProgress  { labelId, language, steps: Record<PathStep, 'locked'|'current'|'validated'|'skipped'>,
                stepAttempts: Record<PathStep, Record<cardId, boolean>>, // last result per card per step
                finalChallengeBest?: number }                           // best score out of 20
Progress     += { dailyXp: number, dailyXpDay: string, brumeDays: string[],
                  gameLevels: Record<string, { level: 1|2|3, window: boolean[] }>, // key: `${game}:${language}`
                  rushRecords: Record<string, number>, stamps: number, dailyRewardedCount: Record<cardId, number> }
Settings     += { dailyGoalXp (default 300), newPerDay (default 5), sfxEnabled (default true),
                  sfxVolume (0..1, default 0.6), audioFreeMode (default false), rushTimeMultiplier (1|1.5|2),
                  intensiveExamMode: Record<labelId, boolean> }
```

---

## 1. Boucle de session

### 1.1 Vue d'ensemble

Une session porte sur **une seule langue** (onglet Chinois ou Anglais). Elle est **composée automatiquement** ; l'élève appuie sur « Commencer » et n'a rien à choisir.

| Phase | Nom affiché | Contenu | Note FSRS ? | Part du budget |
|---|---|---|---|---|
| 1. `watering` | **Arrosage** | Mots qui ont soif (révisions dues), exercices de reconnaissance | Oui (1re exposition du jour) | ~45 % |
| 2. `newSeeds` | **Nouvelles graines** | Mots nouveaux : découverte audio + vérification immédiate | Oui | ~20 % |
| 3. `miniGame` | **Mini-jeu** | Une manche d'un mini-jeu sur les mots de la session | Seulement pour les mots pas encore notés aujourd'hui | ~15 % (≈ 90 s) |
| 4. `messenger` | **Le Messager** | Dictée tapée courte (`ListenType`) : mots au stade tige ou plus + mots ratés plus tôt dans la session | Oui pour les mots pas encore notés | ~20 % (≈ 2 min) |
| 5. `summary` | **Bilan** | XP, jauge du label, plantes qui ont changé de stade, objectif du jour | — | 20–30 s |

Une phase vide est **sautée** (ex. aucun mot nouveau). Entre deux phases, un écran de transition de 1,5 s maximum (ou Entrée) annonce la suite : « Arrosage terminé. Place aux nouvelles graines : 5 mots. »

**Durée cible : 10 min** (`sessionTargetSec` = 600). Minimum indicatif 5 min, plafond dur 15 min (`sessionHardCapSec` = 900). Une session peut être plus courte s'il y a peu à faire : c'est une bonne nouvelle, on le dit (« Rien d'autre n'a soif aujourd'hui. »).

### 1.2 Règle « une note FSRS par mot et par jour »

- FSRS (ts-fsrs) est configuré **sans pas d'apprentissage court** (`enable_short_term: false`) : il raisonne en jours.
- Seule la **première réponse notée** d'un mot dans le jour local met à jour son `ReviewState` (`lastRatedDay = today`).
- Les réponses suivantes du même jour (mini-jeu, re-demande après erreur, Messager) donnent de l'XP (§4) et alimentent le parcours (§5), mais **ne touchent pas FSRS**. Cela évite qu'un même mot soit « appris » artificiellement en 3 minutes.

**Correspondance réponse → note FSRS :**

| Résultat | Condition | Note |
|---|---|---|
| `correct` | sans indice, et (exercice à choix) `responseMs ≤ choiceSlowMs` (8 s) | `good` |
| `correct` | exercice à choix, `responseMs > choiceSlowMs` | `hard` |
| `correctWithHint` | indice utilisé (pinyin révélé, 1re lettre…) | `hard` |
| `almost` | anglais : faute de frappe tolérée (§6.2) | `hard` |
| `wrong` | mauvaise réponse ou bouton « Je ne sais pas » | `again` |
| bouton « Je le connais déjà » | uniquement en découverte (mot nouveau) | `easy` |

Le temps de réponse **n'est pas** utilisé pour les exercices tapés (la vitesse de l'IME varie trop).

### 1.3 Composition automatique de la session du jour

**Entrées** : `now`, `language`, toutes les cartes de la langue avec leur `ReviewState`, les labels (`isFocus`, `examDate`), le journal du jour (mots déjà notés / introduits aujourd'hui), `GameConfig`, `Settings`.

**Paniers** (une carte n'apparaît que dans un panier, le premier qui la contient) :

| Panier | Contenu | Tri |
|---|---|---|
| `T1` | Mots dus d'un label épinglé **avec** date de contrôle à venir | date de contrôle croissante, puis rétention estimée `R` croissante |
| `T2` | Mots dus d'un label épinglé sans date | `R` croissante |
| `NEW` | Mots jamais vus (`reps = 0`) des labels épinglés, puis (si aucun label épinglé n'a de mot nouveau) des autres mots | label au contrôle le plus proche d'abord, puis ordre d'ajout (`createdAt`) |
| `T3` | Autres mots dus (« soif » hors labels épinglés) | `R` croissante |

« Dû » = `state.due ≤ endOfLocalDay(now)` et `lastRatedDay ≠ today`.

**Pseudo-code :**

```ts
function composeDailySession(input: ComposeInput, cfg: GameConfig): SessionPlan {
  const { t1, t2, newCards, t3 } = buildBaskets(input);
  if (t1.length + t2.length + newCards.length + t3.length === 0) {
    return emptyPlan(input.cards.length === 0 ? 'noCards' : 'nothingDue');
  }
  const budget = cfg.sessionTargetSec;
  const reserveOld = Math.min(sumCost(t3), budget * cfg.oldReviewReserveRatio); // old words are never starved
  const plan = new PlanBuilder(cfg);

  // 1. Focus reviews (T1 may overflow up to the hard cap: the exam comes first)
  for (const c of t1) if (!plan.tryAdd(c, 'watering', cfg.sessionHardCapSec - reserveOld)) break;
  for (const c of t2) if (!plan.tryAdd(c, 'watering', budget - reserveOld)) break;

  // 2. New words, bounded by today's quota (section 2) and by session size
  const quota = Math.min(dailyNewQuota(input, cfg) - input.introducedToday, cfg.maxNewPerSession);
  for (const c of newCards.slice(0, Math.max(0, quota)))
    if (!plan.tryAdd(c, 'newSeeds', budget - reserveOld)) break;

  // 3. Old reviews fill the rest of the budget
  for (const c of t3) if (!plan.tryAdd(c, 'watering', budget)) break;

  // 4. Assign the rated exercise of each card (stage + unlocked path steps), then
  //    move production-type items to the messenger phase
  plan.assignExercises(exerciseFor);
  // 5. Append the mini-game round and the messenger phase (practice on session cards)
  plan.addMiniGame(pickMiniGame(plan.cards, input, cfg));
  plan.addMessenger(cfg.messengerMinWords, cfg.messengerMaxWords);
  plan.leftover = remainingDueCount(t1, t2, t3, plan); // shown as "bonus session" offer
  return plan.build();
}
```

`tryAdd(card, phase, limitSec)` ajoute la carte si `spentSec + itemCostSec[exercise] ≤ limitSec`. Les coûts estimés (en secondes, retour inclus) sont dans `GameConfig.itemCostSec`.

**Choix de l'exercice noté d'un mot** (`exerciseFor`) :

| Stade actuel | Exercice noté | Condition |
|---|---|---|
| `seed` (nouveau) | `discovery` puis vérification `listenMeaning` niveau 1 | — |
| `sprout` | `listenMeaning` | — |
| `stem` | alternance `listenMeaning` / `typeEcho` (selon `reps % 2`) | `typeEcho` si l'étape « taper » est débloquée pour ce label, sinon `listenMeaning` |
| `bud` et plus | rotation `listenType` (Messager) / `typeEcho` / `sentenceListen` (selon `reps % 3`) | `sentenceListen` seulement si le mot a un exemple ; `listenType` si l'étape « dictée » est débloquée (ou mot hors label épinglé) |

Pour un mot **hors label épinglé**, toutes les étapes sont considérées débloquées. Pour un mot de **plusieurs** labels épinglés, on prend l'étape la plus avancée.

**Re-demande après une erreur** : un mot raté est remis dans une file `relearnQueue` et redemandé **3 items plus tard** (`relearnGapItems`) dans la même phase, ou au Messager s'il ne reste plus assez d'items. Au plus 2 re-demandes par mot et par session (`maxRelearnPerCardPerSession`). Ces re-demandes ne changent pas FSRS.

**Session bonus** : si `plan.leftover > 0`, le bilan propose « Encore 12 mots ont soif. Environ 4 min. Continuer ? ». Ce n'est jamais une alerte, juste un bouton secondaire. La session bonus est composée avec le même algorithme (le budget repart de zéro).

**Beaucoup de retard en révisions** (ex. retour après 3 semaines, 300 mots dus) : on ne cherche pas à tout rattraper. Le tri par `R` croissante traite d'abord les mots les plus oubliés ; message au bilan : « Beaucoup de plantes ont soif. On les arrose sur plusieurs jours, pas d'un coup. » FSRS s'occupe du reste.

### 1.4 Quitter en cours de route

- **Chaque réponse est enregistrée immédiatement** (une transaction Dexie : `ReviewState` + `SessionResult` + `Progress`). Rien n'est perdu si l'onglet se ferme.
- Le bouton **« Quitter »** est toujours visible. Pas de fenêtre de culpabilisation : un seul écran « Tes 14 réponses sont enregistrées. » avec « Reprendre plus tard » (par défaut) et « Retour au jardin ».
- Un `SessionDraft` (plan + position) est sauvegardé. Le même jour local, l'accueil affiche « Reprendre la session (≈ 3 min) ». Le lendemain, le brouillon est supprimé : les mots non faits sont toujours dus et reviendront dans la nouvelle session.
- Le **bonus de fin de session (+30 XP)** n'est accordé que si la session atteint le bilan. L'XP des réponses déjà données reste acquise.
- **Onglet caché** (`visibilitychange`) : pause automatique (TTS arrêtée, minuteries figées).
- Une session abandonnée compte pour la série si le seuil de jour actif est atteint (§4.5).

### 1.5 Hors session

- **Séance d'étape** (depuis le parcours) : 3–5 min sur une étape précise d'un label (§5.3).
- **Entraînement libre** : l'élève choisit labels + exercice (comme dans `DESIGN.md` §3). Mêmes règles d'XP et de note FSRS.
- **Défi final** (§5.4) et **Course des saisons** (§6.9).

---

## 2. Planification avec date de contrôle

### 2.1 Notations

- `today` : jour local (§0.3). `E` : jour du contrôle (`examDate` du label).
- `daysLeft = E − today` (en jours entiers). Le jour du contrôle n'est **pas** un jour de travail.
- Pour une carte, `E(card)` = date de contrôle **la plus proche et à venir** parmi ses labels épinglés (une carte peut appartenir à deux labels avec contrôle).
- `N_new(label)` : mots du label (dans la langue) jamais vus. `N(label)` : tous les mots du label dans la langue.
- **Fenêtre du contrôle** : `W = [E − examWindowDays, E − 1]` avec `examWindowDays = 2` (avant-veille et veille).

### 2.2 Quota de mots nouveaux par jour

On garde une **journée de réserve** (révision seule, sans mot nouveau) quand c'est possible :

```
reserveDays  = daysLeft >= 3 ? examReserveDays (1) : 0
introDays    = max(1, daysLeft - reserveDays)
quota(label) = ceil(N_new(label) / introDays)               // DESIGN.md formula, with the reserve day
```

Quota du jour, tous labels confondus :

```ts
function dailyNewQuota(input, cfg): number {
  const examLabels = focusLabels.filter(l => l.examDate && daysLeft(l) >= 1);
  const examQuota  = sum(examLabels.map(quota));            // shared cards counted once (dedupe by cardId)
  const cap = anyIntensive(examLabels) ? cfg.intensiveMaxNewPerDay : cfg.maxNewPerDay;
  const base = hasNewCards(input) ? settings.newPerDay : 0; // default 5
  return Math.min(cap, Math.max(base, examQuota));
}
```

Les mots nouveaux sont ensuite pris dans le panier `NEW` (labels au contrôle le plus proche d'abord). La session limite à `maxNewPerSession` = 12 ; au-delà, le reste du quota du jour est proposé en session bonus.

Exemple : 25 mots, contrôle dans 7 jours → `introDays = 6`, quota = `ceil(25/6) = 5` mots/jour, tous vus en 5 jours, les 2 derniers jours servent à consolider.

### 2.3 Plafonnement des intervalles avant le contrôle

Objectif : **chaque mot du label est revu au moins une fois dans la fenêtre `W`**. On applique un plafond après le calcul FSRS, sans modifier la stabilité (FSRS reste la mémoire « vraie » ; on avance seulement la date).

```ts
function capDueForExam(fsrsDue: Date, card: Card, now: Date, cfg: GameConfig): Date {
  const E = nearestUpcomingExamDay(card);           // undefined if none
  const today = localDay(now);
  if (!E || today >= E) return fsrsDue;             // no exam, or exam day reached
  const windowStart = addDays(E, -cfg.examWindowDays);
  if (today < windowStart) {
    // Before the window: the next review lands at the latest on windowStart
    return minDate(fsrsDue, startOfLocalDay(max(windowStart, addDays(today, 1))));
  }
  // Inside the window: today's review satisfies the requirement
  return fsrsDue;
}
```

Conséquences :
- Un mot appris 15 jours avant le contrôle avec FSRS qui propose 20 jours sera revu à `E − 2`.
- Un intervalle FSRS court (1, 3 jours) n'est jamais allongé.
- La fenêtre vaut 2 jours : un élève qui rate la veille a encore l'avant-veille, et inversement.

### 2.4 Prévision et statut du plan

Pour afficher un message **honnête**, on simule les jours restants avec la même politique (`forecastExamPlan`). C'est une fonction pure, testable :

```ts
function forecastExamPlan(label, cards, states, today, cfg): ExamForecast {
  // Deterministic answer model: every `forecastFailEvery`-th answer is wrong (~86% success)
  // Simulate each day d in [today, E-1]: compose (new quota + due reviews), apply answers, update FSRS.
  return {
    days: [{ day, newCount, reviewCount, estMinutes }],
    coveredNew,               // new words introduced before E
    uncoveredNew,             // new words that will not be seen before E
    expectedMasteredAtExam,   // cards at stage >= stem on day E
    maxMinutesPerDay,
    status,                   // see table below
  };
}
```

| Statut | Condition | Message (exemple) |
|---|---|---|
| `onTrack` | `uncoveredNew = 0` et `maxMinutesPerDay ≤ examTightMinutes` (15) | « Contrôle dans 6 jours. 5 mots nouveaux par jour, ≈ 9 min. Ça passe. » |
| `tight` | `uncoveredNew = 0` et 15 < `maxMinutesPerDay` ≤ `examOverloadMinutes` (25) | « Ça va être serré : ≈ 20 min par jour jusqu'à jeudi. » |
| `overloaded` | `uncoveredNew > 0` ou `maxMinutesPerDay > 25` | « 60 mots en 2 jours, c'est trop pour tout voir sérieusement. À 20 mots par jour, tu en découvriras 40. » |
| `shortNotice` | `daysLeft = 1` | « Contrôle demain : on vise la reconnaissance de tous les mots aujourd'hui. La maîtrise durable viendra après. » |
| `examDay` | `daysLeft = 0` | « C'est aujourd'hui. Échauffement de 5 min ? » (révision des mots du label, aucun mot nouveau) |
| `past` | `daysLeft < 0` | voir §2.6 |

Le statut est recalculé à chaque ouverture de l'accueil et après chaque session (événement `ExamPlanStatusChanged` s'il change).

### 2.5 Retard trop grand : priorisation

En statut `overloaded`, l'appli **ne cache rien et ne dramatise rien**. Elle propose trois choix (un seul écran, réversible) :

1. **« Garder le rythme normal »** (par défaut) : quota plafonné à `maxNewPerDay` (20). Ordre de priorité des mots nouveaux :
   1. mots déjà commencés mais pas maîtrisés (ils coûtent moins à terminer) — ils sont dans les révisions ;
   2. mots marqués **« essentiel »** par l'élève (case à cocher dans la liste du label, facultatif) ;
   3. ordre d'ajout dans le label (souvent l'ordre de la leçon).

   Le compte à rebours affiche « 40 mots vus sur 60 prévus ».
2. **« Mode intensif »** (choix explicite, par label) : plafond porté à `intensiveMaxNewPerDay` (30) et plafond de session à `intensiveSessionHardCapSec` (25 min). Désactivé automatiquement après le contrôle.
3. **« Survoler les autres »** : une passe de découverte rapide (flashcards audio, 8 s par mot) des mots non couverts. Ces mots sont introduits (`reps ≥ 1`) mais le message reste honnête : « survolés, pas maîtrisés ».

### 2.6 Après le contrôle

- À `E + autoUnfocusDelayDays` (1 jour), le label est **désépinglé automatiquement** (`isFocus = false`, `examDate` effacée). Une bannière l'annonce avec « Annuler » pendant toute la journée.
- Les mots passent en **révision longue** : plus de plafonnement, FSRS normal. Les plantes continuent de pousser.
- Le parcours du label reste consultable ; il n'est jamais remis à zéro.

### 2.7 Modification de la date

Changer ou supprimer `examDate` recalcule simplement le plan au prochain affichage. Les `due` déjà plafonnés restent (ils sont seulement plus tôt que nécessaire, ce qui est sans danger).

---

## 3. Stades de la plante, soif et jauge de maîtrise

### 3.1 Calcul du stade

Le stade dépend de la **stabilité FSRS** `S` (en jours : le temps au bout duquel la probabilité de rappel tombe à 90 %) **et** du nombre de **jours distincts** avec au moins une réussite (`successDays`). Le second critère empêche d'obtenir une fleur en une seule journée avec un « Facile ».

| Stade | `Stage` | Condition (la plus haute satisfaite) | Visuel |
|---|---|---|---|
| Graine | `seed` | `reps = 0` | graine dans la terre |
| Pousse | `sprout` | `reps ≥ 1` | deux feuilles |
| Tige | `stem` | `S ≥ 3` et `successDays ≥ 2` | tige avec feuilles |
| Bouton | `bud` | `S ≥ 7` et `successDays ≥ 3` | bouton fermé |
| Fleur | `flower` | `S ≥ 21` et `successDays ≥ 4` | fleur ouverte |
| Lanterne | `lantern` | `S ≥ 60` et `successDays ≥ 5` | fleur-lanterne lumineuse |

```ts
function computeStage(s: ReviewState, cfg: GameConfig): Stage {
  if (s.reps === 0) return 'seed';
  for (const t of cfg.stageThresholds) // ordered from lantern down to stem
    if (s.stability >= t.minStabilityDays && s.successDays >= t.minSuccessDays) return t.stage;
  return 'sprout';
}
```

`successDays` est incrémenté quand une réponse `correct`, `correctWithHint` ou `almost` arrive un jour où `lastSuccessDay ≠ today`.

### 3.2 Stade actuel et stade record

- `currentStage = computeStage(state)` : **honnête**, il peut baisser après un oubli (la stabilité baisse après `again`). C'est lui qui sert à la **jauge de maîtrise**.
- `peakStage` : le plus haut stade jamais atteint, **ne baisse jamais**. C'est lui qui détermine la **taille de la plante** dans le jardin, les déblocages et l'XP de stade (on ne gagne pas deux fois l'XP d'un même stade).
- Si `currentStage < peakStage`, la plante garde sa taille mais est **« fanée »** (feuilles tombantes, couleurs un peu ternes) jusqu'à ce qu'elle retrouve son stade. Rien ne meurt.
- `StageReached` est émis quand `currentStage` augmente ; `isNewPeak` indique si `peakStage` augmente aussi.

### 3.3 La soif

```ts
function thirstLevel(s: ReviewState, now: Date, cfg: GameConfig): 0 | 1 | 2 {
  if (s.reps === 0 || s.due > endOfLocalDay(now)) return 0;         // not due today
  return retrievability(s, now) < cfg.strongThirstRetrievability ? 2 : 1;  // 0.7
}
```

- `0` : pas soif. `1` : **a soif** (dû aujourd'hui), petite goutte vide au-dessus de la plante. `2` : **très soif** (probabilité de rappel estimée < 70 %), feuilles tombantes.
- Réviser = arroser : la goutte se remplit à la réponse, quel que soit le résultat (on a fait l'effort). La soif disparaît car FSRS repousse `due`.
- Aucune conséquence négative au-delà du visuel.

### 3.4 Jauge de maîtrise d'un label

Indicateur principal, affiché avant l'XP, **par langue** :

```
mastery(label, language) = count(cards with currentStage >= masteryStage ('stem'))
                           / count(cards of label in language)
```

- Affichage : « 18/25 mots maîtrisés » + barre segmentée par stade (graine, pousse, tige, bouton, fleur, lanterne), couleurs + motifs (pas seulement la couleur).
- Label vide dans cette langue : jauge masquée, texte « Aucun mot chinois dans ce label ».
- Avec contrôle : « Contrôle dans 4 jours · 18/25 mots maîtrisés · prévision : 25/25 » (prévision = `expectedMasteredAtExam` du §2.4).
- En `shortNotice` (contrôle demain), la jauge affiche en plus « 22/25 réussis aujourd'hui », car la maîtrise (2 jours distincts) est impossible en 1 jour ; on le dit.

---

## 4. Économie

### 4.1 XP par action

| Action | XP de base | Soumis aux rendements décroissants ? |
|---|---|---|
| Réponse `correct` | 10 | oui |
| Réponse `correctWithHint` ou `almost` | 5 | oui |
| Réponse `wrong` (y compris « Je ne sais pas ») | 2 (l'effort compte, et « Je ne sais pas » n'est pas pénalisé par rapport à une réponse au hasard) | oui |
| Mot découvert (phase Nouvelles graines) | 5 | oui |
| Session terminée (bilan atteint) | 30 | oui |
| Dictée du Messager terminée | 10 + un **timbre** | oui |
| Stade gagné (nouveau record `peakStage`, par mot et par stade) | 15 | **non** (jalon d'apprentissage réel) |
| Étape de parcours validée | 50 | **non** |
| Défi final réussi (1re fois par label) | 100 | **non** |
| Course des saisons | 3 par bonne réponse, max 60 par manche, 3 manches récompensées par jour | oui |

**Anti-répétition** : un même mot rapporte l'XP normal sur ses **3 premières** réponses du jour (`maxRewardedAnswersPerCardPerDay`), puis 1 XP.

### 4.2 Objectif du jour et rendements décroissants

- **Objectif du jour par défaut : 300 XP** (réglable : 150 « léger », 300 « normal », 450 « soutenu »). Une session normale de 10 min rapporte ≈ 350–450 XP (§10), donc **une session suffit**.
- L'XP du jour (`dailyXp`) est commun aux deux langues et remis à zéro au changement de jour local.
- Multiplicateur appliqué aux gains « soumis » :

```ts
function xpMultiplier(dailyXpBefore: number, goal: number): number {
  if (dailyXpBefore < goal) return 1;
  if (dailyXpBefore < 2 * goal) return 0.5;
  return 0.25;
}
const gained = base > 0 ? Math.max(1, Math.floor(base * xpMultiplier(dailyXp, goal))) : 0;
```

- Objectif atteint : anneau complet sur l'accueil, petite bannière non bloquante (§7). **Pas d'XP bonus** pour l'objectif (éviter la pression de « finir l'anneau »).
- Au-delà de l'objectif, l'interface le dit simplement : « Objectif atteint. Les XP comptent moitié moins, ta mémoire, elle, en profite toujours. »

### 4.3 Niveaux

XP pour passer du niveau `n` au niveau `n+1` : `100 + 50·(n − 1)`.
XP cumulé pour atteindre le niveau `n` : `T(n) = 100·(n − 1) + 25·(n − 1)·(n − 2)`.

```ts
function levelFromXp(xp: number): number {      // largest n with T(n) <= xp
  let n = 1;
  while (100 * n + 25 * n * (n - 1) <= xp) n++; // T(n+1) <= xp
  return n;
}
```

| Niveau | XP cumulé | Écart | | Niveau | XP cumulé | Écart |
|---|---|---|---|---|---|---|
| 1 | 0 | — | | 11 | 3 250 | 550 |
| 2 | 100 | 100 | | 12 | 3 850 | 600 |
| 3 | 250 | 150 | | 13 | 4 500 | 650 |
| 4 | 450 | 200 | | 14 | 5 200 | 700 |
| 5 | 700 | 250 | | 15 | 5 950 | 750 |
| 6 | 1 000 | 300 | | 16 | 6 750 | 800 |
| 7 | 1 350 | 350 | | 17 | 7 600 | 850 |
| 8 | 1 750 | 400 | | 18 | 8 500 | 900 |
| 9 | 2 200 | 450 | | 19 | 9 450 | 950 |
| 10 | 2 700 | 500 | | 20 | 10 450 | 1 000 |

À ≈ 400 XP par jour : niveau 10 vers le 7e jour, niveau 20 vers le 26e jour. Pas de niveau maximum.

### 4.4 Série et jours « brume »

- Un **jour actif** = au moins `activeDayMinAnswers` (10) réponses, **ou** une session terminée (même courte, s'il y avait peu à faire).
- La **série** compte les jours actifs consécutifs. Un jour manqué est couvert automatiquement par un **jour brume** s'il en reste dans la **semaine ISO** (lundi–dimanche) de ce jour : **2 par semaine** (`brumeDaysPerWeek`). Un jour brume **gèle** la série (elle ne monte pas, elle ne tombe pas).
- Les jours brume ne s'achètent pas, ne se gagnent pas et ne s'accumulent pas.
- Sinon la série repart à 0 ; `bestStreak` est conservé. Message neutre : « Nouvelle série. Ton record : 23 jours. »

```ts
function rollStreak(p: Progress, today: string, cfg: GameConfig): Progress {
  // Called once on app open / first answer of the day
  let streak = p.streakDays;
  const brume = [...p.brumeDays];
  for (let d = addDays(p.lastActiveDate, 1); d < today; d = addDays(d, 1)) {
    const usedThisWeek = brume.filter(b => isoWeek(b) === isoWeek(d)).length;
    if (usedThisWeek < cfg.brumeDaysPerWeek) brume.push(d);
    else { streak = 0; break; }
  }
  return { ...p, streakDays: streak, brumeDays: pruneOlderThan(brume, 14) };
}
// When the day becomes active: if lastActiveDate !== today -> streakDays += 1,
// bestStreak = max(bestStreak, streakDays), lastActiveDate = today.
```

- Aucune notification de série. Le calendrier de la semaine montre les jours actifs (plante), brume (nuage léger), manqués (vide, sans croix rouge).

### 4.5 Calendrier des déblocages

Tous **cosmétiques**, **déterministes** et **visibles à l'avance** : l'écran Jardin montre « Prochains déblocages » (les 3 suivants, avec la condition exacte) et une page « Tous les déblocages ». La table vit dans `GameConfig.unlockSchedule`.

**Par niveau :**

| Niveau | Déblocage (`unlockId`) | | Niveau | Déblocage |
|---|---|---|---|---|
| 2 | Ponton en bois (`pier`) | | 12 | Pont en arc (`archBridge`) |
| 3 | Lampions sur le chemin (`pathLamps`) | | 13 | Ruches (`beehives`) |
| 4 | Bancs de pierre (`stoneBenches`) | | 14 | Phare (`lighthouse`) |
| 5 | Palette « automne » (`paletteAutumn`) | | 15 | Palette « nuit » (`paletteNight`) |
| 6 | Étang (`pond`) | | 16 | Jardin de galets (`pebbleGarden`) |
| 7 | Cerf-volant (`kite`) | | 17 | Observatoire (`observatory`) |
| 8 | Bambous (`bamboo`) | | 18 | Grand arbre (`greatTree`) |
| 9 | Barque (`rowboat`) | | 19 | Cascade (`waterfall`) |
| 10 | Pavillon (`pavilion`) + palette « hiver » (`paletteWinter`) | | 20 | Palette « aube » (`paletteDawn`) + îlot voisin (`secondIslet`) |

Au-delà du niveau 20 : un élément de décor tous les 2 niveaux (liste étendue plus tard), sans changer les règles.

**Par réalisation :**

| Condition | Déblocage |
|---|---|
| Chaque tranche de 10 mots ayant atteint `flower` (`peakStage`) | +1 luciole (au-delà de 50, les lucioles s'agrègent visuellement) |
| Chaque tranche de 5 mots `lantern` | +1 lanterne flottante sur l'eau |
| Parcours d'un label terminé (défi final réussi) | Banderole au nom du label (texte affiché comme nœud texte, jamais en HTML) |
| Phrase validée dans l'atelier de phrases (`DESIGN.md` §5 bis) | Petite banderole-phrase |
| Chaque dictée du Messager terminée | Timbre dans le carnet du Messager |
| Record de série 7 jours / 30 jours | Brume dorée au lever du jour / arc-en-ciel discret |

---

## 5. Parcours par label

### 5.1 Les 7 étapes

Le parcours existe **par label épinglé et par langue**. Il se dessine comme un sentier de 7 pierres sur l'île.

| # | `PathStep` | Nom affiché | Exercices | Critère de validation |
|---|---|---|---|---|
| 1 | `discover` | Découvrir | `discovery` (flashcard audio) | ≥ 80 % des mots introduits (`reps ≥ 1`) |
| 2 | `listen` | Écouter | `listenMeaning` | ≥ 80 % des mots avec un dernier essai `correct` en `listenMeaning` |
| 3 | `recognize` | Reconnaître | `bridgeMatch` + `toneEcho` (zh) / paires proches (en) | ≥ 80 % des mots réussis en `bridgeMatch` **et**, si au moins 5 mots sont éligibles à `toneEcho`, ≥ 80 % de réussite sur les 20 derniers items `toneEcho` du label |
| 4 | `type` | Taper | `typeEcho` (sens → mot tapé) | ≥ 80 % des mots avec un dernier essai `correct` en `typeEcho` |
| 5 | `dictation` | Dictée | `listenType` (Le Messager) | ≥ 80 % des mots avec un dernier essai `correct` en `listenType` |
| 6 | `sentences` | Phrases | `sentenceListen` + `sentenceShuffle` | ≥ 80 % des mots **ayant un exemple** réussis en `sentenceListen` **et** au moins `min(3, nb d'exemples)` phrases remises en ordre |
| 7 | `finalChallenge` | Défi final | mélange, simulation du contrôle | note ≥ 16/20 |

Précisions :

- **Seuil** : `required = ceil(stepPassRatio × n)` avec `stepPassRatio = 0.8` et `n` = nombre de mots du label dans la langue (pour l'étape 6, `n` = mots ayant un exemple). Ex. : 25 mots → 20 ; 4 mots → 4 ; 1 mot → 1.
- **« Dernier essai »** : on retient, par mot et par étape, le résultat de la **dernière** réponse dans un exercice de cette étape (`PathProgress.stepAttempts`). `correctWithHint` et `almost` ne valident pas. Toute réponse compte, qu'elle vienne d'une session, d'une séance d'étape ou de l'entraînement libre.
- **Une étape validée le reste** (pas de perte de progression), même si des mots sont oubliés ensuite. La jauge de maîtrise, elle, reste honnête.
- **Étape 6 sans exemples** : si moins de `minExamplesForSentenceStep` (3) mots ont un exemple, l'étape passe en `skipped` (« Ajoute des phrases d'exemple pour activer cette étape ») et **ne bloque pas** l'étape 7.
- **Sans voix TTS** ou en `audioFreeMode` : les étapes 2, 3 (partie `toneEcho`) et 5 utilisent leurs variantes écrites (§6) ; rien n'est bloqué.

### 5.2 Déverrouillage

- Les étapes se débloquent **dans l'ordre** : l'étape courante est la première non validée (ni `skipped`).
- Le parcours **filtre les exercices de la session** pour les mots du label : un mot n'est jamais dicté (`listenType`) avant que l'étape « dictée » soit atteinte (§1.3).
- **Test de passage** (pour élèves avancés qui connaissent déjà les mots) : sur l'étape courante, « Passer l'étape » lance `placementTestSize` (10) items de cette étape sur des mots tirés au sort. Si ≥ 90 % (`placementPassRatio`) → étape validée (`via: 'placementTest'`). Sinon rien n'est perdu ; les réponses comptent normalement. Le test peut être relancé.

### 5.3 Séance d'étape

Depuis le parcours, « Continuer l'étape » lance 3–5 min (`stepSessionTargetSec` = 240) sur **les mots qui ne remplissent pas encore le critère**, triés par `R` croissante. Les mots déjà validés servent de distracteurs. La séance s'arrête dès que l'étape est validée (célébration, §7.3).

### 5.4 Défi final : simulation du contrôle

**But** : se mettre en condition de contrôle. **Conseillé dans la fenêtre `W`** (avant-veille ou veille), mais disponible dès que l'étape 6 est validée ou sautée.

**Composition :**

- `n = min(finalChallengeMaxWords (30), N(label))` mots. Si le label en a plus, on prend les 30 avec la plus faible `R` (seed fixée par le jour pour qu'une relance le même jour donne le même tirage).
- Trois sections, dans l'ordre d'un vrai contrôle :

| Section | Exercice | Part | Règles |
|---|---|---|---|
| Compréhension orale | `listenMeaning` niveau 3 + `sentenceListen` (si exemples) | 30 % | pas d'indice |
| Dictée | `listenType` | 40 % | le mot est lu **deux fois** automatiquement (vitesse 0,85 puis 1,0), puis **1 relecture** au plus à la demande (`finalChallengeReplaysPerWord` = 1) |
| Traduction | `typeEcho` | 30 % | pas d'indice, pas d'écho sonore avant validation |

  Si le label n'a pas d'exemples, la part `sentenceListen` est reportée sur `listenMeaning`.
- **Pas de retour pendant le défi** (comme un contrôle) : on valide et on passe. Barre de progression « 12/30 ».
- **Note sur 20**, au demi-point : `score20 = round(40 × points / n) / 2` avec `correct` = 1 point, `almost` = 0,5.
- **Réussi si `score20 ≥ 16`** (`finalChallengePassScore20`).
- **Écran de résultat** : note, détail par section, liste des mots ratés (avec bouton audio), bouton « Revoir ces 6 mots » (micro-séance de 2 min).
- Les réponses suivent la règle FSRS du jour (§1.2) : un mot raté non encore noté aujourd'hui reçoit `again` et revient vite.
- Relances illimitées ; les 100 XP ne sont donnés qu'à la **première réussite** ; `finalChallengeBest` garde la meilleure note. Après une réussite, l'accueil affiche « Prêt pour le contrôle » sur le label.

---

## 6. Fiches des mini-jeux

### 6.0 Règles communes

#### Entrées

- **Souris / tactile** : cibles ≥ 44×44 px, espacement ≥ 8 px, pas de glisser-déposer obligatoire (toujours une alternative « clic sur A puis clic sur B »).
- **Clavier, exercices à choix** : `1`–`6` choisissent une option, `Espace` ou `R` rejoue le son, `L` rejoue lentement (×0,6), `Entrée` passe au suivant après un retour, `Échap` ouvre le menu Pause.
- **Clavier, exercices tapés (IME)** : on ne réagit **jamais** à une touche pendant une composition IME (`event.isComposing` ou entre `compositionstart` et `compositionend`). `Entrée` hors composition valide. `↑` rejoue, `↓` rejoue lentement (les flèches servent à l'IME pendant la composition, donc ignorées à ce moment-là). Les boutons « Indice » et « Je ne sais pas » sont atteignables par `Tab`. `Espace` n'est pas utilisé (sélection des candidats IME).
- **Rejouer le son n'est jamais un indice** et n'est pas limité (sauf au défi final).

#### Génération des distracteurs (module `distractors`)

Utilisée par `listenMeaning`, `sentenceListen`, `bridgeMatch` (choix des paires d'un plateau), `sentenceShuffle` (morceau intrus), `seasonRush`.

1. **Pool** : cartes de la même langue, `id ≠ cible`, déjà introduites de préférence (`reps ≥ 1`), sinon toutes.
2. **Exclusions obligatoires** (une question ne doit jamais avoir deux bonnes réponses) :
   - même `term` ;
   - **sens en conflit** : `glosses(a) ∩ glosses(b) ≠ ∅`, où `glosses(t)` = traduction en minuscules, sans accents, sans contenu entre parenthèses, découpée sur `,` `;` `/` `|` (séparateurs de `src/domain/meaning/senses.ts`), chaque morceau sans article ni particule de tête (`le`, `la`, `les`, `l'`, `un`, `une`, `des`, `du`, `de la`, `se`, `s'`, `to`) ;
   - **homophones exacts** dans les exercices audio : zh, même pinyin **avec** tons (ex. 是/事 shì) ; en, même mot ou paire de la liste embarquée d'homophones (`two/too`, `their/there`…).
3. **Score de proximité** `sim(cible, candidat)` :

| Critère (chinois) | Points | | Critère (anglais) | Points |
|---|---|---|---|---|
| même nombre de caractères | +1 | | longueur à ±1 lettre | +1 |
| caractère en commun (max 2 comptés) | +2 chacun | | distance de Levenshtein ≤ 2 | +3 |
| syllabe identique sans ton, même position | +2 chacune | | distance de Levenshtein = 3 | +1,5 |
| même schéma de tons | +1 | | mêmes 2 premières lettres | +1 |
| même initiale ou même finale, même position | +0,5 chacune | | mêmes 3 dernières lettres (rime) | +1,5 |
| caractère au même radical (si la donnée est disponible) | +1 | | paire minimale de la liste embarquée | +4 |
| partage un label avec la cible | +1,5 | | partage un label avec la cible | +1,5 |

4. **Sélection selon le niveau de difficulté** `d` (§6.0, difficulté adaptative), avec `k = options(d) − 1` distracteurs :
   - `d = 1` (3 options) : `k` candidats tirés parmi la **moitié la moins proche** du pool (faciles à éliminer) ;
   - `d = 2` (4 options) : 1 candidat parmi les 3 plus proches, le reste au hasard ;
   - `d = 3` (4 options) : `k` candidats tirés parmi les `2k` plus proches.
5. **Pool trop petit** : si `|pool| < k`, on réduit à `|pool| + 1` options, minimum 2. Si `|pool| = 0` (un seul mot dans la langue), l'exercice n'est **pas éligible** ; on retombe sur `typeEcho` ou `audioFlashcard` (auto-évaluation).

Dans `listenMeaning`, les options affichées sont des **sens**, mais la proximité est calculée sur le **son** des mots : on entend 时间, on voit « temps », « événement » (事件), « en fait » (实际)… C'est ce qui entraîne vraiment l'oreille.

#### Difficulté adaptative (commune)

- Un niveau `d ∈ {1, 2, 3}` par couple `(mini-jeu, langue)`, stocké dans `Progress.gameLevels`. **Niveau initial 2** (public avancé).
- Fenêtre glissante des 8 dernières réponses (`adaptiveWindow`) : ≥ 7 justes → `d + 1` ; ≤ 5 justes → `d − 1` ; la fenêtre est vidée après chaque changement.
- Les mots au stade `sprout` sont plafonnés à `d = 2` ; la vérification juste après une découverte est toujours en `d = 1`.
- Le changement de niveau est **silencieux** (pas de « Niveau difficile débloqué ! »), mais visible dans l'écran d'aide du jeu.

#### Retours (communs)

| | Bonne réponse | Mauvaise réponse |
|---|---|---|
| Visuel | option ou champ bordé de vert + icône ✓ ; mini-plante : goutte qui tombe (300 ms) | option choisie bordée d'ocre + icône ✗ ; la bonne option bordée de vert ; pas de tremblement, pas de rouge vif |
| Texte | « Juste. » puis le mot complet : hanzi, pinyin coloré (avec diacritiques), sens | « C'était 时间 (shíjiān), temps. » + ce que l'élève a choisi : « Tu as choisi : événement = 事件 (shìjiàn) » |
| Son | effet `answer-correct` (§7.2) | effet `answer-wrong` (doux), puis **le mot cible est rejoué** automatiquement ; bouton pour écouter le mot choisi par erreur (comparaison) |
| Rythme | passage automatique après `feedbackCorrectMs` (900 ms) ou `Entrée` | **pas** de passage automatique : `Entrée` ou bouton « Continuer », pour laisser le temps de lire |
| Lecteur d'écran | région `aria-live="polite"` : « Juste. 时间, shíjiān, temps. » | « Faux. La réponse était 时间, shíjiān, temps. » |

#### Accessibilité (commune)

- Toute information est donnée par **couleur + icône + texte** ; tons colorés **toujours** doublés du diacritique.
- `lang="zh-CN"` sur les hanzi et le pinyin, `lang="en"` sur l'anglais.
- Focus visible, ordre de tabulation logique, le focus est replacé sur la zone de réponse à chaque nouvel item.
- **Aucune limite de temps** sauf `seasonRush` (optionnel, durée réglable ×1, ×1,5, ×2).
- **Mode sans audio** (`audioFreeMode`, pour élève malentendant ou sans voix TTS disponible) : chaque exercice audio a une variante écrite décrite dans sa fiche. Rien n'est bloqué ; un bandeau discret l'indique.
- Contraste AA (4,5:1 pour le texte), taille de hanzi ≥ 32 px dans les questions.

### 6.1 `ListenMeaning` — Écouter et choisir le sens

| | |
|---|---|
| **But** | Reconnaître un mot **à l'oreille** et retrouver son sens. |
| **Déroulé** | 1. Le mot est prononcé automatiquement (rien d'écrit). 2. 3 ou 4 sens en français s'affichent. 3. L'élève choisit. 4. Retour. Un item ≈ 7 s. |
| **Entrées** | Clic/tap sur une option ; touches `1`–`4` ; `Espace`/`R` rejouer ; `L` lent ; bouton « Je ne sais pas » (`0`). |
| **Distracteurs** | Règles communes, proximité **sonore**. Les sens affichés sont ceux des distracteurs. |
| **Chinois / anglais** | zh : voix `zh-CN`, les options sont des sens FR. en : voix `en-GB`, mêmes règles avec les critères anglais. |
| **Difficulté** | `d1` 3 options lointaines ; `d2` 4 options dont 1 proche ; `d3` 4 options proches. Au défi final, toujours `d3`. |
| **Indice** | « Voir le pinyin » (zh) / « Voir l'écrit » (en) → résultat `correctWithHint`. |
| **Retours** | Communs. Sur erreur, comparaison audio cible / mot choisi. |
| **Accessibilité / sans audio** | Variante écrite : le mot s'affiche en hanzi (sans pinyin) / en lettres, mêmes options. |
| **XP / FSRS** | Communs (§1.2, §4.1). Lent (> 8 s) → `hard`. |

### 6.2 `ListenType` — Dictée tapée (Le Messager)

| | |
|---|---|
| **But** | Entendre un mot et **l'écrire** exactement (hanzi pour le chinois, orthographe pour l'anglais). |
| **Déroulé** | 1. Le mot est prononcé. 2. Champ de saisie avec focus. 3. `Entrée` valide. 4. Retour avec comparaison caractère par caractère. Dans le Messager, une série de 5 à 10 mots ; à la fin, un timbre. Un item ≈ 12 s. |
| **Entrées** | Clavier (IME) ; `↑` rejouer, `↓` lent ; boutons « Rejouer », « Indice », « Je ne sais pas ». Tactile : clavier du téléphone. |
| **Comparaison zh** | Normalisation : NFC, suppression des espaces, ponctuation pleine chasse → demi-chasse, puis **égalité exacte** des hanzi. Pas de tolérance. Si la saisie a le **même pinyin** que la cible (pinyin-pro) mais d'autres caractères → reste `wrong`, avec un message spécifique : « Bon son, mauvais caractère : 在 au lieu de 再. » |
| **Comparaison en** | Minuscules, espaces compactés, apostrophes typographiques normalisées. Acceptés comme `correct` : variantes UK/US (`-our/-or`, `-ise/-ize`, `-yse/-yze`, `-re/-er`, `-ll-/-l-` + liste embarquée), `to` facultatif devant un verbe (`to run` ↔ `run`). `almost` : distance de Levenshtein = 1 pour un mot de ≥ 6 lettres (retour : « Presque : *necessary*. »). |
| **Distracteurs** | Aucun. |
| **Difficulté** | `d1` : nombre de caractères/lettres affiché (cases vides) ; `d2` : rien ; `d3` : vitesse 1,0 et une seule lecture automatique. |
| **Indices** | 1er : pinyin avec tons (zh) / 1re lettre + longueur (en). 2e : 1er caractère. Tout indice → `correctWithHint`. |
| **Retours** | Communs ; diff par caractère (juste en vert souligné, faux en ocre barré, manquant en pointillé). |
| **Sans audio** | Variante : le pinyin avec tons s'affiche (zh) / la transcription phonétique ou le sens (en), l'élève tape le mot. |

### 6.3 `ToneEcho` — Tons (zh) et paires proches (en)

| | |
|---|---|
| **But** | Distinguer ce qui se ressemble à l'oral : les **tons** en chinois, les **paires minimales** en anglais. |
| **Déroulé zh** | `d1` : une syllabe isolée tirée des mots de l'élève, choisir le ton (1–4, neutre). `d2` : un mot de 2 syllabes, taper le schéma de tons (ex. `34`). `d3` : **paire minimale** : deux pinyins proches s'affichent (shíjiān / shìjiàn), on entend l'un des deux, choisir lequel. Après la réponse, les hanzi et le sens s'affichent. Un item ≈ 5 s ; une manche = 10 items. |
| **Déroulé en** | Toujours le format paire minimale : deux mots s'affichent (*ship* / *sheep*), on en entend un, choisir lequel. `d1` : contrastes très différents ; `d3` : paires difficiles pour les francophones (/ɪ/–/iː/, /θ/–/s/, /h/ muet…). |
| **Entrées** | zh `d1`/`d2` : touches `1`–`4`, `5` ou `0` pour le ton neutre ; 4+1 gros boutons. Paires : `←`/`→` ou `1`/`2`, deux gros boutons. `Espace` rejouer. |
| **Source des items** | zh : pinyin des cartes (tons de citation). Sandhi : on attend les tons **de citation** (你好 = `33`), 一 et 不 exclus de `d1`/`d2`. Paires : deux cartes de l'élève de même pinyin sans tons ; sinon une syllabe d'une carte opposée à la même syllabe avec un autre ton, prononcée via un caractère courant de la table embarquée `syllableCharTable` (issue d'Unihan, licence Unicode, à vérifier). en : liste embarquée de paires minimales ; un mot de l'élève est éligible s'il figure dans une paire. |
| **Distracteurs** | Les autres tons / l'autre mot de la paire. |
| **Difficulté** | Commune (fenêtre de 8). |
| **Retours** | Communs ; sur erreur, les deux sons sont rejoués l'un après l'autre (« shí… shì ») avec le contour de ton dessiné en SVG (courbe 5 niveaux). |
| **Sans audio** | Non pertinent : le jeu est masqué en mode sans audio, la partie `toneEcho` de l'étape 3 est ignorée. |
| **XP / FSRS** | XP communs. Pour la note FSRS, `toneEcho` ne note **pas** le mot (il teste un son, pas le vocabulaire). |

### 6.4 `BridgeMatch` — Relier les deux rives

| | |
|---|---|
| **But** | Associer vite et sûrement **son ou écrit** et **sens**, sur un petit lot. |
| **Déroulé** | Deux rives : à gauche 4 à 6 éléments (boutons audio ▶ numérotés, ou hanzi/mots), à droite les sens FR. Chaque paire juste pose une planche du pont (SVG). Un plateau ≈ 30 s ; une manche = 2 plateaux. |
| **Variantes** | `d1` : hanzi/mot ↔ sens, 4 paires. `d2` : audio ↔ sens, 5 paires (défaut zh). `d3` : audio ↔ hanzi/mot, 6 paires choisies proches entre elles. |
| **Entrées** | Clic gauche puis clic droite (ou l'inverse) ; glisser-déposer facultatif ; clavier : `1`–`6` à gauche, `A`–`F` à droite ; survol/focus d'un bouton audio = lecture. |
| **Distracteurs** | Les autres paires du plateau. Constitution du plateau : la 1re carte, puis les suivantes par `sim` décroissant (`d3`) ou au hasard (`d1`), en respectant les exclusions (sens en conflit, homophones). |
| **Chinois / anglais** | Identique ; en `en`, le côté gauche montre le mot ou l'audio `en-GB`. |
| **Évaluation** | Chaque paire = une réponse : `correct` si la 1re tentative pour cet élément est juste, sinon `wrong`. Une association fausse revient en place (150 ms) sans compter de nouvelle erreur pour la même paire. |
| **Retours** | Planche qui se pose (250 ms) + son `plank`. Erreur : les deux éléments clignotent en ocre une fois, retour en place. Fin de plateau : le pont complet, le personnage traverse (si animations actives). |
| **Accessibilité** | Pas de drag obligatoire ; annonce « Paire juste : 时间, temps. 3 sur 5. ». Sans audio : variante `d1` forcée. |

### 6.5 `SentenceListen` — Le mot dans la phrase

| | |
|---|---|
| **But** | Reconnaître un mot **en contexte**, à vitesse normale. |
| **Éligibilité** | La carte a un `example` qui contient `term` (zh : sous-chaîne ; en : mot entier, insensible à la casse, formes simples -s/-ed/-ing acceptées). Phrase ≤ 40 caractères (zh) / 25 mots (en). |
| **Déroulé** | `d1`/`d2` : la phrase est lue, « Quel mot de ta liste as-tu entendu ? », 3 ou 4 mots écrits (hanzi sans pinyin / mots anglais). `d3` : la phrase est lue puis affichée avec un trou à la place du mot, l'élève **tape** le mot manquant (comparaison de §6.2). Un item ≈ 15 s. |
| **Entrées** | Comme `listenMeaning` (`d1`/`d2`) ou `listenType` (`d3`). |
| **Distracteurs** | Règles communes, proximité **sonore**, en excluant tout mot **présent dans la phrase** (sinon deux bonnes réponses). |
| **Retours** | La phrase complète s'affiche avec le mot surligné, pinyin au survol ou au focus ; bouton « Réécouter la phrase ». |
| **Sans audio** | La phrase s'affiche avec un trou ; choisir le mot qui convient (lecture). |

### 6.6 `SentenceShuffle` — Remettre la phrase dans l'ordre

| | |
|---|---|
| **But** | Reconstruire une phrase d'exemple : ordre des mots, sens global. |
| **Découpage** | zh : `Intl.Segmenter('zh', { granularity: 'word' })`, puis fusion des plus petits morceaux voisins jusqu'à `shuffleMaxChunks` (8) ; la ponctuation finale reste collée au dernier morceau. en : découpage sur les espaces, ponctuation collée au mot. Phrases de 3 à 8 morceaux seulement. |
| **Déroulé** | Les morceaux mélangés (tirage à graine, jamais dans l'ordre d'origine) ; l'élève les place un par un dans la ligne-réponse ; `Entrée` ou bouton « Valider ». Un item ≈ 25 s ; une manche = 3 phrases. |
| **Audio** | `d1` : la phrase est lue au départ et peut être rejouée (l'écoute aide). `d2` : lecture disponible après une erreur. `d3` : lecture seulement après validation, et **un morceau intrus** est ajouté (un mot proche, même label, `sim` max) qui doit rester inutilisé. |
| **Entrées** | Clic/tap sur un morceau = l'ajouter à la fin ; clic sur un morceau placé = le retirer ; clavier : `1`–`9` ajoutent, `Retour arrière` retire le dernier ; glisser-déposer facultatif. |
| **Validation** | Juste si la chaîne reconstruite est **identique** à la phrase d'origine (on compare les chaînes, pas les index, pour accepter deux morceaux identiques échangés). Un ordre différent mais correct n'est pas reconnu : le retour le dit honnêtement (« Ta phrase est peut-être correcte aussi ; voici celle de ta liste. ») et l'élève peut cliquer « J'étais juste » → résultat `correct`, sans note FSRS. |
| **Retours** | Juste : les morceaux s'alignent (200 ms), la phrase est lue. Faux : le plus long préfixe correct reste en vert, le reste revient dans la réserve ; 2e essai possible (alors `correctWithHint`). |
| **FSRS** | Pas de note FSRS (exercice de phrase, pas d'un mot) ; XP et parcours uniquement. |

### 6.7 `TypeEcho` — Du sens au mot (production)

> Précision par rapport à `DESIGN.md` : « écrire le mot entendu », c'est `ListenType`. `TypeEcho` travaille l'autre sens, **la production** : on voit le sens, on tape le mot, et l'« écho » sonore confirme. C'est l'exercice le plus proche d'une question de contrôle « traduis ».

| | |
|---|---|
| **But** | Retrouver le mot à partir du **sens français** (rappel actif du vocabulaire). |
| **Déroulé** | 1. Le sens s'affiche (« temps, durée »). 2. L'élève tape le mot. 3. `Entrée` : retour, et le mot est **prononcé** (l'écho). Un item ≈ 14 s. |
| **Entrées** | Comme `listenType`. |
| **Comparaison** | Celle de §6.2. **Synonymes de la liste** : si la saisie est une autre carte de l'élève dont les `glosses` recouvrent celles de la cible → résultat neutre : « Juste aussi, mais on cherchait un autre mot : 时候… » ; pas de note FSRS, l'item revient plus tard avec l'exemple affiché en plus. |
| **Difficulté** | `d1` : sens + nombre de caractères + exemple avec trou ; `d2` : sens + nombre de caractères ; `d3` : sens seul. |
| **Indices** | 1er : pinyin sans tons (zh) / 1re lettre (en) ; 2e : 1er caractère. → `correctWithHint`. |
| **Retours** | Communs + écho sonore systématique (même en bonne réponse). |
| **Sans audio** | Identique sans l'écho. |

### 6.8 `AudioFlashcard` et `discovery` (exercices de base)

- **`discovery`** (mot nouveau) : recto = son seul (lecture auto) ; « Voir » (`Espace`) → hanzi + pinyin + sens + exemple lu. Boutons : « Suivant » et « Je le connais déjà » (→ `easy`, +5 XP, pas de vérification). Le mot est vérifié 2–3 items plus tard par `listenMeaning` `d1`, dont le résultat donne la 1re note FSRS.
- **`audioFlashcard`** (repli quand aucun exercice objectif n'est éligible) : recto son, verso mot ; auto-évaluation « Raté / Difficile / Bien / Facile » (`1`–`4`) → `again/hard/good/easy`, XP 2/5/10/10.

### 6.9 `SeasonRush` — Course des saisons (optionnel)

| | |
|---|---|
| **But** | Réviser vite des mots **déjà maîtrisés** (stade ≥ tige), contre **son propre record**. |
| **Activation** | Désactivable (`Settings.speedGameEnabled`, activé par défaut) ; jamais proposé automatiquement dans la session, seulement depuis le jardin. Nécessite ≥ 8 mots au stade tige ou plus dans la langue. |
| **Déroulé** | 60 s (`rushDurationSec` × `rushTimeMultiplier`). Items `listenMeaning` `d2` enchaînés sans pause. Le décor passe printemps → été → automne → hiver toutes les 15 s. Fin : score, record personnel. |
| **Entrées** | Comme `listenMeaning` ; pas de bouton « Je ne sais pas » (on passe avec `0`, sans pénalité). |
| **FSRS** | **Aucune note FSRS** (la pression du temps fausse la mesure de mémoire). |
| **XP** | 3 par bonne réponse, 60 max par manche, 3 manches récompensées par jour. |
| **Retours** | Minimaux pour garder le rythme : bordure verte/ocre 150 ms, pas de son long ; les erreurs sont listées à la fin avec audio. |
| **Accessibilité** | Durée ×1,5 ou ×2 ; mode sans audio = variante écrite ; en `prefers-reduced-motion`, le décor change par fondu simple. Record = « ton meilleur score », jamais comparé à d'autres. |

---

## 7. Retours et « juice »

Objectif : des retours **nets et rapides**, qui font plaisir sans créer de dépendance. Une seule « grosse » célébration par écran, toujours passable (`Entrée`, clic, `Échap`).

### 7.1 Animations

| Élément | Durée | Easing | Avec `prefers-reduced-motion: reduce` |
|---|---|---|---|
| Survol / appui sur un bouton | 100 ms | `ease-out` | changement de couleur seul |
| Bordure de retour (juste/faux) | 150 ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | instantané |
| Goutte sur la mini-plante | 300 ms | `cubic-bezier(0.3, 0, 0.7, 1)` (chute) | la plante change de teinte |
| Apparition du mot complet | 200 ms | `ease-out`, fondu + 4 px de glissement | fondu 0 ms |
| Planche de pont (`BridgeMatch`) | 250 ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | apparition directe |
| Croissance d'une plante (nouveau stade) | 600 ms | `cubic-bezier(0.34, 1.3, 0.64, 1)` (léger rebond) | fondu croisé 200 ms |
| Transition entre phases | 300 ms | `ease-in-out` | instantané |
| Étape de parcours validée | 1 200 ms max | pierre du sentier qui s'illumine + chemin vers la suivante | icône ✓ statique |
| Objectif du jour atteint | 800 ms | l'anneau se ferme | anneau plein statique |

Contraintes techniques : animations CSS (`transform`, `opacity`) et SVG uniquement ; pas de bibliothèque d'animation ; pas de style inline généré depuis des données utilisateur (CSP) : les classes CSS sont fixes, les valeurs viennent de variables CSS définies dans la feuille de style.

### 7.2 Sons

Générés avec la **Web Audio API** (oscillateurs + enveloppes, aucun fichier externe, compatible CSP) ou petits fichiers OGG embarqués si le rendu est meilleur. Volume séparé de la voix (`sfxVolume`), coupure globale `sfxEnabled`. Les effets durent ≤ 250 ms et la voix TTS ne démarre qu'après la fin de l'effet (pas de chevauchement).

| Id | Quand | Caractère |
|---|---|---|
| `answer-correct` | bonne réponse | deux notes montantes douces (≈ 180 ms) |
| `answer-wrong` | mauvaise réponse | une note grave courte, feutrée (≈ 150 ms), jamais un buzzer |
| `water-drop` | goutte d'arrosage | « ploc » (≈ 120 ms) |
| `plank` | paire juste dans `BridgeMatch` | bois léger (≈ 100 ms) |
| `stage-up` | une plante change de stade (au bilan) | carillon 3 notes (≈ 400 ms) |
| `step-validated` | étape de parcours validée | accord court (≈ 600 ms) |
| `daily-goal` | objectif du jour atteint | 2 notes de cloche (≈ 500 ms) |
| `session-end` | arrivée au bilan | accord doux descendant (≈ 500 ms) |
| `stamp` | timbre du Messager | tampon (≈ 150 ms) |
| `rush-tick` | `SeasonRush`, 5 dernières secondes | tic discret ; désactivable séparément |

Pas de son de clic d'interface par défaut, pas de musique de fond (elle gênerait l'écoute).

### 7.3 Célébrations

| Événement | Où | Forme | Durée |
|---|---|---|---|
| Changement de stade | **au bilan** (regroupé, pas en pleine série de questions) | rangée des plantes qui ont grandi, chacune avec le mot | 600 ms par plante, 5 max animées, le reste en liste |
| Étape validée | à la fin de l'item qui la valide, puis au bilan | carte « Étape *Écouter* validée — Leçon 7. Suivante : *Reconnaître*. » + `step-validated` | 1,2 s, passable |
| Objectif du jour | bannière en haut, **non bloquante** | « Objectif du jour atteint. » | 2 s |
| Montée de niveau | au bilan | « Niveau 8 » + déblocage associé dessiné | 1 s |
| Défi final réussi | écran de résultat | note, banderole qui se déroule sur l'île | 1,5 s |

Interdits : confettis plein écran, compteur qui défile pendant plusieurs secondes, « +XP » qui volent partout, message qui insiste pour continuer.

---

## 8. Écrans à maquetter

Chaque écran liste ses états et leur contenu. Les textes sont des exemples (ils iront dans `i18n/fr.json`).

### 8.1 Accueil (`HomeScreen`)

| État | Contenu |
|---|---|
| `default` | Onglets Chinois / Anglais ; aperçu de l'île (plantes, soif) ; cartes des labels épinglés (jauge, compte à rebours, statut du plan) ; bouton principal « Commencer (≈ 10 min) » ; anneau de l'objectif du jour ; série + record ; niveau + barre d'XP |
| `resumeAvailable` | Bouton principal « Reprendre la session (≈ 3 min) », lien « Nouvelle session » |
| `nothingDue` | « Rien n'a soif aujourd'hui. » + boutons secondaires : entraînement libre, parcours, Course des saisons |
| `noCards` | Île vide avec une seule graine ; « Ajoute tes premiers mots » (saisie, import) ; bouton de session désactivé |
| `noVoice` | Bandeau « Voix chinoise introuvable » + « Tester / installer la voix » ; session en variante écrite |
| `examBanner` | Variante d'une carte label selon le statut (`onTrack`, `tight`, `overloaded` avec les 3 choix, `shortNotice`, `examDay`, `past` + « Annuler le désépinglage ») |

### 8.2 Session : écran d'exercice (`ExerciseScreen`, un gabarit pour tous les mini-jeux)

Zones fixes : en haut, phase + progression (« Arrosage · 7/18 »), mini-plante, bouton Quitter ; au centre, la question ; en bas, la réponse et les boutons d'aide.

| État | Contenu |
|---|---|
| `intro` (1re fois pour ce jeu) | une phrase de règle + exemple animé de 2 s ; « Compris » |
| `presenting` | icône haut-parleur animée pendant la lecture ; options grisées jusqu'à la fin de la 1re lecture (max 1,5 s) |
| `awaitingAnswer` | options actives ou champ avec focus ; boutons Rejouer, Lent, Indice, Je ne sais pas |
| `hintShown` | l'indice apparaît sous la question (pinyin, 1re lettre…) ; mention « avec indice » |
| `feedbackCorrect` | ✓, « Juste. », mot complet, goutte ; passage automatique |
| `feedbackAlmost` | ✓ ocre clair, « Presque : *necessary*. », diff ; bouton Continuer |
| `feedbackWrong` | ✗, bonne réponse + réponse donnée, diff (exercices tapés), boutons « Réécouter », « Écouter mon choix », « Continuer » |
| `paused` | voile, « En pause », Reprendre / Quitter |
| `audioError` | « Le son n'a pas pu être lu. » ; Réessayer / Passer en écrit pour cet exercice |

### 8.3 Transitions et fin de session

| Écran / état | Contenu |
|---|---|
| `PhaseTransition` | nom de la phase suivante, nombre d'items, 1,5 s ou Entrée |
| `QuitConfirm` | « Tes 14 réponses sont enregistrées. » ; Reprendre plus tard / Retour au jardin |
| `SessionSummary.default` | durée, réponses justes / total, XP gagnés (détail repliable), jauge du ou des labels épinglés avant → après, objectif du jour, série |
| `SessionSummary.withStages` | + rangée des plantes ayant grandi |
| `SessionSummary.withStep` | + carte d'étape validée |
| `SessionSummary.withLevelUp` | + niveau et déblocage |
| `SessionSummary.bonusOffer` | + « Encore 12 mots ont soif (≈ 4 min). Continuer ? » (bouton secondaire) |
| `SessionSummary.partial` | session reprise après abandon : mêmes infos, sans le bonus de fin si non terminée |

### 8.4 Parcours (`PathScreen`)

| État | Contenu |
|---|---|
| `default` | sentier de 7 pierres ; pour chaque étape : nom, état (`locked`, `current`, `validated`, `skipped`), compteur « 14/20 mots » ; pour l'étape courante : « Continuer l'étape », « Passer l'étape (test) » |
| `stepValidated` | pierre illuminée, carte de félicitation sobre, étape suivante mise en avant |
| `sentencesSkipped` | étape 6 grisée avec « Ajoute des phrases d'exemple pour activer cette étape » + lien vers la liste |
| `placementResult` | « 9/10 : étape validée » ou « 7/10 : pas encore. Tes réponses comptent quand même. » |

### 8.5 Défi final (`FinalChallengeScreen`)

| État | Contenu |
|---|---|
| `intro` | « Conditions de contrôle : 30 questions, pas d'indice, pas de correction avant la fin. Environ 8 min. » ; Commencer |
| `section` | titre de la section (Compréhension orale / Dictée / Traduction), progression « 12/30 » |
| `inProgress` | question sans retour ; après validation, item suivant |
| `result.passed` | note /20, détail par section, banderole, « Prêt pour le contrôle » |
| `result.notYet` | note /20, mots ratés avec audio, « Revoir ces 6 mots (≈ 2 min) » |

### 8.6 Jardin (`GardenScreen`)

| État | Contenu |
|---|---|
| `default` | île en SVG, parcelle chinoise et anglaise ; plantes regroupées par label (filtre) ; survol/focus d'une plante = mot, stade, prochaine révision |
| `thirsty` | gouttes vides au-dessus des plantes qui ont soif + bouton « Arroser » (lance la session) |
| `wilted` | plantes fanées (stade actuel < record) reconnaissables à leurs feuilles tombantes |
| `unlocks` | panneau « Prochains déblocages » : 3 suivants avec condition exacte (« Niveau 9 : barque — encore 340 XP ») |
| `empty` | île nue, une graine, invitation à ajouter des mots |
| `listView` | alternative accessible : tableau des mots avec stade, soif, prochaine révision (même information sans dessin) |
| `island` | île SVG en tête du jardin (0.7.0) : sa taille grandit à chaque niveau jusqu'au niveau 20 (parcelles en plus tous les 4 niveaux, ruisseau au niveau 11, pont en arc au 12) ; chaque déblocage de §4.5 y est posé à une place fixe, le suivant en silhouette pointillée avec « niveau N » ; palette du dernier déblocage de palette ; lucioles (12 dessinées au plus) et lanternes flottantes (8 au plus). Texte alternatif complet et liste « Déjà sur ton île » |
| `islandGrowth` | à la première ouverture après une montée de niveau : l'île passe de la taille vue la dernière fois (`progress.islandLevelSeen`) à la nouvelle en 800 ms, puis le nouveau décor apparaît (400 ms) ; avec `prefers-reduced-motion`, état final direct. Une seule fois, jamais bloquant |

---

## 9. Événements du domaine et machines à états

### 9.1 Événements émis par le domaine (consommés par le module jeu)

Tous les événements portent `at: string` (ISO) et `day: string` (jour local). Ce sont des objets immuables, sérialisables.

```ts
type DomainEvent =
  | { type: 'SessionStarted'; sessionId: string; language: Language; labelIds: string[];
      kind: 'daily' | 'bonus' | 'step' | 'free' | 'finalChallenge' | 'rush';
      plannedItems: number; estimatedSec: number; resumed: boolean }
  | { type: 'CardIntroduced'; sessionId: string; cardId: string; language: Language; labelIds: string[];
      knownAlready: boolean }
  | { type: 'AnswerGiven'; sessionId: string; cardId: string | null;   // null for toneEcho synthetic items
      language: Language; exercise: ExerciseType; difficulty: 1 | 2 | 3;
      outcome: Outcome; rating: Rating | null;                         // null when FSRS was not updated
      hintsUsed: number; responseMs: number; isRelearn: boolean; pathStep: PathStep | null }
  | { type: 'StageReached'; cardId: string; language: Language; labelIds: string[];
      fromStage: Stage; toStage: Stage; isNewPeak: boolean }
  | { type: 'CardMastered'; cardId: string; language: Language; labelIds: string[] } // first time peakStage >= 'stem'
  | { type: 'MessengerCompleted'; sessionId: string; language: Language; words: number; correct: number }
  | { type: 'SessionCompleted'; sessionId: string; language: Language; kind: SessionKind;
      durationMs: number; answers: number; correct: number; newCards: number; leftoverDue: number }
  | { type: 'SessionAbandoned'; sessionId: string; language: Language; answers: number; durationMs: number }
  | { type: 'PathStepValidated'; labelId: string; language: Language; step: PathStep;
      via: 'progress' | 'placementTest' | 'skipped' }
  | { type: 'FinalChallengeFinished'; labelId: string; language: Language; score20: number;
      passed: boolean; firstPass: boolean }
  | { type: 'ExamPlanStatusChanged'; labelId: string; language: Language; from: ExamStatus | null;
      to: ExamStatus; requiredNewPerDay: number; maxMinutesPerDay: number; uncoveredNew: number }
  | { type: 'LabelAutoUnfocused'; labelId: string; examDate: string }
  | { type: 'DayStarted'; previousActiveDay: string | null; today: string };  // emitted on first app use of the day
```

### 9.2 Événements produits par le module jeu (pour l'interface)

Le module jeu est un **réducteur pur** : `applyEvent(state: GameState, event: DomainEvent, cfg, settings) → { state, effects: GameEffect[] }`. Il est testé sans DOM ni IndexedDB.

```ts
type GameEffect =
  | { type: 'XpAwarded'; amount: number; base: number; multiplier: number; reason: XpReason }
  | { type: 'LevelUp'; from: number; to: number; unlocks: string[] }
  | { type: 'DailyGoalReached'; goal: number }
  | { type: 'StreakUpdated'; streakDays: number; bestStreak: number; brumeUsed: string[]; reset: boolean }
  | { type: 'UnlockGranted'; unlockId: string; trigger: UnlockTrigger }
  | { type: 'StampEarned'; total: number }
  | { type: 'CelebrationQueued'; kind: 'stage' | 'step' | 'dailyGoal' | 'level' | 'finalChallenge'; payload: unknown };
```

| Événement | Effets principaux |
|---|---|
| `DayStarted` | `rollStreak`, remise à zéro de `dailyXp` et `dailyRewardedCount` |
| `CardIntroduced` | +5 XP (×multiplicateur) |
| `AnswerGiven` | XP selon `outcome`, anti-répétition, multiplicateur ; mise à jour de la difficulté adaptative ; jour actif si 10 réponses ; `DailyGoalReached` au franchissement |
| `StageReached` (`isNewPeak`) | +15 XP ; comptage fleurs/lanternes → `UnlockGranted` |
| `MessengerCompleted` | +10 XP, `StampEarned` |
| `SessionCompleted` | +30 XP ; jour actif |
| `PathStepValidated` | +50 XP (sauf `via: 'skipped'`) ; `CelebrationQueued('step')` |
| `FinalChallengeFinished` (`passed && firstPass`) | +100 XP, banderole |

### 9.3 Machine à états de la session

```
            compose()                start()                    answer / next
  idle ───────────────▶ ready ─────────────────▶ running(phase, i) ───────────────┐
   │  ▲                   │                        │   ▲   │                        │
   │  │ nothing to do     │                        │   │   └─ phase done ─▶ phaseTransition ─▶ running(next phase)
   │  └──── empty ◀───────┘          hidden/Échap  ▼   │ resume
   │                                            paused ┘
   │ draft exists today                            │ quit
   └──────────▶ resumable ── resume() ──▶ running  ▼
                                             abandoned ──(same day)──▶ resumable
                         last phase done
  running ─────────────────────────────▶ summary ──▶ done ──(bonus accepted)──▶ idle (compose bonus)
```

| État | Entrée | Événements émis | Sorties |
|---|---|---|---|
| `idle` | — | — | `compose()` → `ready` ou `empty` ; brouillon du jour → `resumable` |
| `empty` | plan vide (`noCards` / `nothingDue`) | — | retour accueil |
| `ready` | plan calculé | — | `start()` → `running` |
| `running` | 1er item | `SessionStarted` (à l'entrée) | réponse → item suivant ; fin de phase → `phaseTransition` ; `visibilitychange`/`Échap` → `paused` ; Quitter → `abandoned` |
| `phaseTransition` | fin d'une phase | `MessengerCompleted` si fin du Messager | 1,5 s ou Entrée → `running` (phase suivante) ou `summary` |
| `paused` | onglet caché / menu | — | Reprendre → `running` ; Quitter → `abandoned` |
| `abandoned` | Quitter | `SessionAbandoned` ; `SessionDraft` sauvegardé | même jour → `resumable` ; jour suivant → brouillon supprimé |
| `resumable` | brouillon du jour | — | `resume()` → `running` (`SessionStarted` avec `resumed: true`) |
| `summary` | dernière phase finie | `SessionCompleted` | `done` |
| `done` | — | — | accueil, ou session bonus |

### 9.4 Machine à états d'un item de mini-jeu

```
 intro? ─▶ presenting ─(audio ended | 1.5 s | no-audio mode)─▶ awaitingAnswer
                │ audio error                                   │   │ hint
                ▼                                               │   ▼
           audioError ─(retry)─▶ presenting                     │ hintShown ─▶ awaitingAnswer (hintsUsed+1)
                └─(switch to written)─▶ awaitingAnswer          │
                                                   submit/choose ▼
                                                           evaluating (pure function)
                                              ┌──────────────┼──────────────┐
                                              ▼              ▼              ▼
                                      feedbackCorrect  feedbackAlmost  feedbackWrong
                                              │ 900 ms/Enter │ Enter        │ Enter
                                              └──────────────┴──────┬───────┘
                                                                    ▼
                                                     next item | roundFinished
 (any state) ── hidden ──▶ paused ── resume ──▶ previous state (presenting restarts audio)
```

- `evaluating` appelle une fonction **pure** (`evaluateAnswer(item, input, cfg) → { outcome, diff, message }`), testée en TDD avec des tables d'exemples (IME, variantes UK/US, homophones, synonymes).
- `AnswerGiven` est émis à l'entrée de l'état de retour, **après** l'écriture en base.
- Défi final : les états `feedback*` sont remplacés par un passage direct à l'item suivant ; la correction est montrée dans `result`.

---

## 10. Métriques d'équilibrage et cas limites

### 10.1 Simulateur

Les métriques sont vérifiées par un **simulateur déterministe** (`simulateStudent`), exécuté dans Vitest. Il utilise les vraies fonctions (`composeDailySession`, FSRS, `capDueForExam`, `applyEvent`) et un modèle d'élève à graine :

| Modèle | Comportement |
|---|---|
| `diligent` | 1 session quotidienne complète ; réussite avec probabilité `clamp(R, 0.5, 0.97)` ; 1re vérification d'un mot nouveau réussie à 70 % |
| `irregular` | même chose, mais seulement 4 jours sur 7 (jours fixés par la graine) |
| `crammer` | rien jusqu'à `E − 2`, puis 2 sessions par jour |
| `strong` | élève avancé : marque 60 % des mots nouveaux « Je le connais déjà » (à raison dans 90 % des cas), réussite `clamp(R, 0.7, 0.98)`, utilise les tests de passage |

Temps simulé = somme des `itemCostSec` des items joués.

### 10.2 Métriques (chacune = un test)

| Id | Scénario | Attendu |
|---|---|---|
| `M1` | `diligent`, label de 25 mots, contrôle dans 7 jours | ≥ 23/25 mots au stade ≥ tige le jour `E` ; temps quotidien ≤ 15 min chaque jour (médiane ≤ 10 min) |
| `M2` | `diligent`, contrôle dans 7 jours | 100 % des mots introduits ont une révision dans la fenêtre `[E−2, E−1]` |
| `M3` | `diligent`, sans contrôle, 200 mots déjà en révision + 5 nouveaux/jour, 60 jours | temps quotidien moyen ≤ 12 min en régime établi (jours 30–60), max ≤ 15 min |
| `M4` | session « normale » (≈ 10 min, 90 % de réussite) | XP de session ∈ [1,0 ; 1,6] × objectif par défaut (300) |
| `M5` | `diligent`, 7 jours | niveau atteint entre 8 et 12 |
| `M6` | 60 min de jeu dans la journée vs 10 min | XP(60 min) ≤ 3 × XP(10 min), hors bonus de jalons (rendements décroissants) |
| `M7` | absent 2 jours par semaine pendant 4 semaines | série jamais remise à zéro |
| `M8` | absent 3 jours consécutifs dans une même semaine | série remise à 0, `bestStreak` inchangé |
| `M9` | `diligent`, 25 mots avec exemples, contrôle dans 7 jours | parcours complet (défi final réussi) atteignable en ≤ 7 jours |
| `M10` | toute session quotidienne composée | temps estimé ≤ `sessionHardCapSec` (hors mode intensif) |
| `M11` | `crammer`, 25 mots, contrôle dans 7 jours | prévision affichée honnête : statut `overloaded` ou `tight` dès `E − 2`, et mots maîtrisés au jour `E` < `M1` (le bachotage ne doit pas être présenté comme équivalent) |
| `M12` | `irregular`, 25 mots, contrôle dans 10 jours | ≥ 20/25 mots au stade ≥ tige le jour `E` |
| `M13` | un mot répété 20 fois dans la journée | XP de ce mot ≤ 3 × 10 + 17 × 1 (avant multiplicateur) et 1 seule note FSRS |
| `M14` | `strong`, 50 mots | parcours jusqu'à l'étape 5 validable en ≤ 3 jours grâce aux tests de passage |

Exemple de nom de test : `it('diligent student masters at least 23 of 25 words before a 7-day exam with at most 15 min per day')`.

### 10.3 Cas limites (chacun = au moins un test)

| Cas | Comportement attendu |
|---|---|
| **0 mot** | `composeDailySession` → plan vide, raison `noCards` ; accueil `noCards` ; aucune erreur ; la série n'est ni augmentée ni cassée par l'ouverture de l'appli |
| **1 mot dans la langue** | pas de distracteurs → exercices à choix non éligibles ; `typeEcho`/`listenType`/`audioFlashcard` utilisés ; `BridgeMatch` masqué |
| **2–3 mots** | options réduites (min 2) ; `BridgeMatch` avec 2–3 paires |
| **Tous les mots ont des sens en conflit** (ex. 3 synonymes) | distracteurs exclus → repli comme « 1 mot » |
| **500 mots dans un label, contrôle dans 7 jours** | quota théorique `ceil(500/6) = 84` → plafonné à 20 ; statut `overloaded` ; « À 20 mots par jour, tu en découvriras 120 sur 500 » ; 3 choix (§2.5) ; sessions ≤ 15 min |
| **500 mots sans contrôle** | 5 nouveaux/jour, aucun message d'alerte |
| **Contrôle demain** (`daysLeft = 1`) | `introDays = 1`, tous les mots nouveaux aujourd'hui (≤ 20, sinon `overloaded`) ; aujourd'hui est dans la fenêtre ; statut `shortNotice` ; jauge « réussis aujourd'hui » |
| **Contrôle aujourd'hui** | statut `examDay` ; aucun mot nouveau du label ; échauffement facultatif |
| **Contrôle passé** | désépinglage à `E + 1` avec annulation possible ; plus de plafonnement |
| **Date de contrôle dans le passé à la saisie** | refusée par la validation du formulaire (zod) |
| **Un mot dans 2 labels avec contrôles différents** | plafonnement sur le contrôle le plus proche ; compté une fois dans les quotas |
| **Label mixte zh/en** | jauges et parcours séparés par langue ; un onglet sans mot du label n'affiche pas ce label |
| **Pas d'exemples** | `sentenceListen`/`sentenceShuffle` non éligibles ; étape 6 `skipped` |
| **Pas de voix TTS** | variantes écrites ; `toneEcho` masqué ; aucune étape bloquée |
| **Retour après 3 semaines** | session plafonnée à 15 min ; tri par `R` ; message « sur plusieurs jours » ; série remise à 0 sans dramatisation |
| **Session commencée avant 4 h, finie après** | appartient au jour de son début ; les réponses après 4 h comptent pour le nouveau jour (XP, FSRS) |
| **Horloge qui recule** | `today = max(localDay(now), lastActiveDate)` ; aucune perte |
| **Mot supprimé pendant une session** | l'item est sauté sans erreur |
| **Mot modifié (traduction) après des révisions** | `ReviewState` conservé ; distracteurs recalculés au prochain item |
| **Terme long** (成语 de 4 caractères, *look forward to*) | comparaison identique ; `BridgeMatch` gère le retour à la ligne ; `toneEcho` `d2` limité à 2 syllabes, donc non éligible |
| **Polyphones** (了, 长, 行) | le pinyin de la carte (éditable) fait foi pour `toneEcho` et l'indice |
| **Saisie IME en cours au moment d'Entrée** | ignorée tant que `isComposing` |
| **Synonyme de la liste tapé en `typeEcho`** | résultat neutre, pas de note FSRS (§6.7) |

---

## 11. `GameConfig` : toutes les constantes

Un seul fichier `src/domain/gameConfig.ts`, objet gelé, injecté dans toutes les fonctions (jamais importé en dur dans le code métier, pour pouvoir tester d'autres valeurs).

```ts
export const GAME_CONFIG = Object.freeze({
  // Calendar
  dayStartHour: 4,

  // FSRS (ts-fsrs)
  fsrs: { requestRetention: 0.9, enableShortTerm: false, enableFuzz: true, maximumIntervalDays: 36500 },

  // Session composition
  sessionTargetSec: 600,
  sessionHardCapSec: 900,
  intensiveSessionHardCapSec: 1500,
  oldReviewReserveRatio: 0.2,
  maxNewPerSession: 12,
  relearnGapItems: 3,
  maxRelearnPerCardPerSession: 2,
  miniGameRoundSec: 90,
  messengerMinWords: 5,
  messengerMaxWords: 10,
  phaseTransitionMs: 1500,
  itemCostSec: {
    discovery: 25, audioFlashcard: 8, listenMeaning: 7, listenType: 12, typeEcho: 14,
    toneEcho: 5, bridgeMatchPair: 6, sentenceListen: 15, sentenceShuffle: 25, seasonRush: 60,
  },
  choiceSlowMs: 8000,

  // New words and exam planning
  defaultNewPerDay: 5,
  newPerDayOptions: [3, 5, 10],
  maxNewPerDay: 20,
  intensiveMaxNewPerDay: 30,
  examWindowDays: 2,
  examReserveDays: 1,
  examReserveMinDaysLeft: 3,
  examTightMinutes: 15,
  examOverloadMinutes: 25,
  autoUnfocusDelayDays: 1,
  forecastFailEvery: 7,

  // Stages, thirst, mastery
  stageThresholds: [
    { stage: 'lantern', minStabilityDays: 60, minSuccessDays: 5 },
    { stage: 'flower',  minStabilityDays: 21, minSuccessDays: 4 },
    { stage: 'bud',     minStabilityDays: 7,  minSuccessDays: 3 },
    { stage: 'stem',    minStabilityDays: 3,  minSuccessDays: 2 },
  ],
  masteryStage: 'stem',
  strongThirstRetrievability: 0.7,

  // XP
  xp: {
    correct: 10, correctWithHint: 5, almost: 5, wrong: 2, cardIntroduced: 5,
    sessionCompleted: 30, messengerCompleted: 10, stageReached: 15,
    pathStepValidated: 50, finalChallengePassed: 100,
    flashcardSelfRating: { again: 2, hard: 5, good: 10, easy: 10 },
  },
  maxRewardedAnswersPerCardPerDay: 3,
  repeatedAnswerXp: 1,
  dailyGoalXpDefault: 300,
  dailyGoalXpOptions: [150, 300, 450],
  diminishingTiers: [
    { fromGoalMultiple: 1, factor: 0.5 },
    { fromGoalMultiple: 2, factor: 0.25 },
  ],
  levelBaseXp: 100,
  levelStepXp: 50,

  // Streak
  activeDayMinAnswers: 10,
  brumeDaysPerWeek: 2,

  // Path
  stepPassRatio: 0.8,
  placementTestSize: 10,
  placementPassRatio: 0.9,
  stepSessionTargetSec: 240,
  minExamplesForSentenceStep: 3,
  finalChallengeMaxWords: 30,
  finalChallengeMix: { listening: 0.3, dictation: 0.4, translation: 0.3 },
  finalChallengeReplaysPerWord: 1,
  finalChallengePassScore20: 16,

  // Mini-games
  adaptive: { initialLevel: 2, windowSize: 8, upMinCorrect: 7, downMaxCorrect: 5, sproutMaxLevel: 2 },
  optionsByLevel: { 1: 3, 2: 4, 3: 4 },
  minOptions: 2,
  bridgeMatchPairsByLevel: { 1: 4, 2: 5, 3: 6 },
  bridgeMatchBoardsPerRound: 2,
  toneEchoItemsPerRound: 10,
  sentenceShuffleMaxChunks: 8,
  sentenceShuffleMinChunks: 3,
  sentenceShufflePerRound: 3,
  sentenceListenMaxLength: { zh: 40, en: 25 },        // characters (zh) / words (en)
  enAlmostMinLength: 6,
  enAlmostMaxDistance: 1,
  similarityWeights: {
    zh: { sameLength: 1, sharedChar: 2, sharedCharMax: 2, sameSyllableToneless: 2, sameTonePattern: 1,
          sameInitialOrFinal: 0.5, sameRadical: 1, sharedLabel: 1.5 },
    en: { lengthWithin1: 1, levenshteinLe2: 3, levenshteinEq3: 1.5, samePrefix2: 1, sameSuffix3: 1.5,
          minimalPair: 4, sharedLabel: 1.5 },
  },

  // Season rush
  rushDurationSec: 60,
  rushTimeMultiplierOptions: [1, 1.5, 2],
  rushMinCards: 8,
  rushXpPerCorrect: 3,
  rushMaxXpPerRound: 60,
  rushMaxRewardedRoundsPerDay: 3,

  // Feedback and juice (ms)
  feedbackCorrectMs: 900,
  anim: { press: 100, feedbackBorder: 150, waterDrop: 300, revealWord: 200, plank: 250,
          stageGrow: 600, phaseTransition: 300, stepValidated: 1200, dailyGoalRing: 800 },
  sfxMaxDurationMs: 250,
  sfxVolumeDefault: 0.6,

  // Unlocks
  firefliesPerFlowers: 10,
  firefliesVisualCap: 50,
  floatingLanternPerLanterns: 5,
  streakUnlockMilestones: [7, 30],
  unlockSchedule: [ /* see section 4.5: { id, trigger: { type: 'level' | 'flowers' | 'lanterns' | 'pathCompleted' | 'stamp' | 'bestStreak', value } } */ ],
});
export type GameConfig = typeof GAME_CONFIG;
```

| Groupe | Constante | Valeur | Rôle |
|---|---|---|---|
| Calendrier | `dayStartHour` | 4 | heure de changement de jour |
| Session | `sessionTargetSec` / `sessionHardCapSec` | 600 / 900 | durée visée / plafond |
| Session | `oldReviewReserveRatio` | 0,2 | part du budget garantie aux anciens mots |
| Session | `maxNewPerSession` | 12 | mots nouveaux max dans une session |
| Session | `relearnGapItems` / `maxRelearnPerCardPerSession` | 3 / 2 | re-demande après erreur |
| Session | `choiceSlowMs` | 8 000 | au-delà : `hard` |
| Contrôle | `defaultNewPerDay` / `maxNewPerDay` / `intensiveMaxNewPerDay` | 5 / 20 / 30 | quotas de mots nouveaux |
| Contrôle | `examWindowDays` / `examReserveDays` | 2 / 1 | fenêtre de révision / jour de réserve |
| Contrôle | `examTightMinutes` / `examOverloadMinutes` | 15 / 25 | seuils de statut |
| Stades | `stageThresholds` | 3/2, 7/3, 21/4, 60/5 | stabilité (j) / jours de réussite |
| Soif | `strongThirstRetrievability` | 0,7 | « très soif » |
| XP | `xp.*` | 10 / 5 / 2 / 5 / 30 / 10 / 15 / 50 / 100 | §4.1 |
| XP | `dailyGoalXpDefault` | 300 | objectif du jour |
| XP | `diminishingTiers` | ×0,5 dès 1× l'objectif, ×0,25 dès 2× | rendements décroissants |
| XP | `maxRewardedAnswersPerCardPerDay` | 3 | anti-répétition |
| Niveaux | `levelBaseXp` / `levelStepXp` | 100 / 50 | `100 + 50·(n−1)` |
| Série | `activeDayMinAnswers` / `brumeDaysPerWeek` | 10 / 2 | |
| Parcours | `stepPassRatio` | 0,8 | seuil des étapes |
| Parcours | `placementTestSize` / `placementPassRatio` | 10 / 0,9 | test de passage |
| Parcours | `finalChallengeMaxWords` / `finalChallengePassScore20` | 30 / 16 | défi final |
| Mini-jeux | `adaptive.*` | 2, 8, 7, 5 | difficulté adaptative |
| Mini-jeux | `optionsByLevel` | 3 / 4 / 4 | nombre d'options |
| Course | `rushDurationSec` / `rushXpPerCorrect` / `rushMaxXpPerRound` | 60 / 3 / 60 | |
| Retours | `feedbackCorrectMs` | 900 | passage auto après bonne réponse |

---

## 12. Décisions prises dans ce document

Points tranchés ici (à valider à la relecture) :

1. **Objectif du jour : 300 XP par défaut au lieu de 120.** Avec les gains du §5 bis (10 XP par bonne réponse), une session de 10 min rapporte ≈ 350–450 XP : 120 serait atteint en 3 minutes. 300 correspond à « une session normale ». Rendements : ×0,5 au-delà de l'objectif (comme prévu) **et** ×0,25 au-delà du double.
2. **Une seule note FSRS par mot et par jour** (première réponse), FSRS sans pas d'apprentissage court. Les répétitions du jour donnent de l'XP et alimentent le parcours, pas la mémoire simulée.
3. **Stade = stabilité FSRS + jours distincts de réussite**, avec un **stade record** (taille de la plante, jamais perdue) distinct du **stade actuel** (jauge honnête, peut baisser). Une plante dont le stade actuel baisse est « fanée », pas morte.
4. **Jour local à 4 h** du matin.
5. **Jour de réserve** avant le contrôle (pas de mot nouveau la veille quand il reste ≥ 3 jours) et **fenêtre de 2 jours** (avant-veille, veille) où chaque mot doit être revu.
6. **Plafonds** : 20 mots nouveaux par jour (30 en mode intensif choisi), 12 par session ; au-delà, statut `overloaded` avec trois choix explicites.
7. **`TypeEcho` redéfini** : sens français → mot tapé, puis écho sonore. « Écrire le mot entendu » reste `ListenType`.
8. **`ToneEcho` et `SentenceShuffle` ne notent pas FSRS** (ils testent un son ou une phrase, pas la mémoire d'un mot) ; **`SeasonRush` non plus** (pression du temps).
9. **Défi final** : 30 mots max, 3 sections (oral 30 %, dictée 40 %, traduction 30 %), pas de retour avant la fin, **note sur 20**, réussite à 16/20.
10. **Test de passage** par étape (10 items, 90 %) pour les élèves avancés qui connaissent déjà les mots.
11. **Étape « phrases » sautée** (non bloquante) s'il y a moins de 3 exemples.
12. **Pas d'XP bonus pour l'objectif du jour** (pour ne pas pousser à « fermer l'anneau ») ; « Je ne sais pas » rapporte autant qu'une erreur (2 XP) pour encourager l'honnêteté.
13. **Désépinglage automatique** au lendemain du contrôle, annulable.
14. **Déblocages uniquement cosmétiques**, table fixe par niveau (2 à 20) et par réalisation ; aucune fonction d'apprentissage verrouillée.
15. **Extensions du modèle de données** (§0.6) : `successDays`, `lastSuccessDay`, `lastRatedDay`, `peakStage`, `SessionDraft`, `PathProgress`, champs de `Progress` et `Settings`. À intégrer à `DESIGN.md` §3 avec une migration.
16. **Données externes à vérifier (licence)** : table syllabe → caractère courant (Unihan), radicaux des caractères (proximité visuelle, facultative), listes embarquées de paires minimales, homophones et variantes UK/US anglaises (à constituer soi-même).
