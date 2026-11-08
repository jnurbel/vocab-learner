import { expect, test, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';
import { reachFinalChallenge } from './pathSeed.ts';

declare global {
  interface Window {
    /** Texts read by the fake speech synthesis, in order. */
    spokenTexts: string[];
  }
}

const MEANING_OF: Readonly<Record<string, string>> = {
  猫: 'chat',
  狗: 'chien',
  鸟: 'oiseau',
  鱼: 'poisson',
};
const TERM_OF: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MEANING_OF).map(([term, meaning]) => [meaning, term]),
);

/** Replaces the browser's speech synthesis before the app loads, with a Chinese voice. */
async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    interface FakeUtterance {
      text: string;
      onend: (() => void) | null;
    }
    window.spokenTexts = [];
    const voices = [
      { lang: 'zh-CN', name: 'Fake Chinese', default: true, localService: true, voiceURI: 'zh' },
    ];
    const synthesis = {
      getVoices: () => voices,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      cancel: () => undefined,
      speak: (utterance: FakeUtterance) => {
        // The blank utterance that unlocks speech on phones is not a word.
        if (utterance.text.trim() !== '') {
          window.spokenTexts.push(utterance.text);
        }
        setTimeout(() => utterance.onend?.(), 20);
      },
    };
    class Utterance {
      lang = '';
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: unknown = null;
      readonly text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synthesis, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: Utterance,
      configurable: true,
    });
  });
}

const spokenCount = (page: Page) => page.evaluate(() => window.spokenTexts.length);

/** Waits for a new word to be spoken, and gives it: the order of the words is never assumed. */
async function nextSpoken(page: Page, alreadySpoken: number): Promise<string> {
  await expect.poll(() => spokenCount(page)).toBeGreaterThan(alreadySpoken);
  return page.evaluate(() => window.spokenTexts.at(-1) ?? '');
}

/** Four Chinese words in the label "Leçon 7", pinned from the labels screen. */
async function pinLessonWithWords(page: Page) {
  await page.goto('./');
  await openWords(page);
  const bulkEntry = page.getByRole('region', { name: 'Saisie en lot' });
  await bulkEntry
    .getByLabel('Un mot par ligne')
    .fill('猫 | mao1 | chat\n狗 | gou3 | chien\n鸟 | niao3 | oiseau\n鱼 | yu2 | poisson');
  await bulkEntry.getByLabel('Nouveau label ou label existant (facultatif)').fill('Leçon 7');
  await bulkEntry.getByRole('button', { name: 'Ajouter 4 mots' }).click();
  await expect(bulkEntry.getByRole('status')).toHaveText('4 mot(s) ajouté(s).');
  await page.getByRole('button', { name: 'Épingler Leçon 7' }).click();
  await expect(page.getByRole('button', { name: 'Désépingler Leçon 7' })).toBeVisible();
}

async function openPathFromHome(page: Page) {
  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Accueil' })
    .click();
  await page.getByRole('button', { name: 'Voir le parcours de Leçon 7' }).click();
  return page.getByRole('list', { name: 'Étapes du parcours' });
}

/** "Continuer l'étape" on the first step: every word is discovered with "Je savais". */
async function discoverEveryWord(page: Page) {
  const steps = await openPathFromHome(page);
  await expect(steps.getByRole('listitem').first()).toContainText('0/4 mots');
  await page.getByRole('button', { name: 'Continuer l’étape' }).click();
  const flashcards = page.getByRole('region', { name: 'Flashcards' });
  const flip = flashcards.getByRole('button', { name: 'Retourner' });
  const summary = flashcards.getByRole('heading', { name: 'Session terminée' });
  await expect(flip.or(summary)).toBeVisible();
  while (await flip.isVisible()) {
    await flip.click();
    await flashcards.getByRole('button', { name: 'Je savais' }).click();
    await expect(flip.or(summary)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Retour au parcours' }).click();
  await expect(page.getByText('Étape validée : Découvrir. +50 XP.')).toBeVisible();
  return steps;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

test('a pinned label path: the first step validated by flashcards opens the second one', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await installFakeSpeech(page);
  await pinLessonWithWords(page);

  const steps = await discoverEveryWord(page);

  await expect(steps.getByRole('listitem').nth(0)).toContainText('Validée');
  await expect(steps.getByRole('listitem').nth(1)).toContainText('À faire');
  await expect(page.getByRole('region', { name: '2. Écouter' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a placement test passed validates the listening step', async ({ page }) => {
  const errors = watchErrors(page);
  await installFakeSpeech(page);
  await pinLessonWithWords(page);
  const steps = await discoverEveryWord(page);

  await page.getByRole('button', { name: 'Passer l’étape (test)' }).click();
  const game = page.getByRole('region', { name: 'Mini-jeu : écouter et choisir le sens' });
  const options = game.getByRole('group', { name: 'Que veut dire ce mot ?' });
  const before = await spokenCount(page);
  for (let answered = 0; answered < 4; answered += 1) {
    const word = await nextSpoken(page, before + answered);
    await options.getByRole('button', { name: MEANING_OF[word] }).click();
  }
  await expect(
    game
      .getByRole('heading', { name: /Fin/ })
      .or(game.getByText(/4\s*\/\s*4/))
      .first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retour au parcours' }).click();

  await expect(page.getByText('4/4 : étape validée.')).toBeVisible();
  await expect(steps.getByRole('listitem').nth(1)).toContainText('Validée');
  expect(errors).toEqual([]);
});

test('the final challenge, heard through the speech synthesis, is scored out of 20', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await installFakeSpeech(page);
  await pinLessonWithWords(page);
  await reachFinalChallenge(page);

  await openPathFromHome(page);
  await page.getByRole('button', { name: 'Lancer le défi final' }).click();
  const challenge = page.getByRole('region', { name: 'Défi final' });
  await expect(challenge.getByText(/Conditions de contrôle : 4 questions/)).toBeVisible();
  let heard = await spokenCount(page);
  await challenge.getByRole('button', { name: 'Commencer' }).click();

  for (let question = 1; question <= 4; question += 1) {
    await expect(challenge.getByText(`${String(question)}/4`, { exact: true })).toBeVisible();
    const section = await challenge.getByRole('heading', { level: 3 }).textContent();
    if (section === 'Compréhension orale') {
      const word = await nextSpoken(page, heard);
      heard += 1;
      await challenge
        .getByRole('group', { name: 'Sens proposés' })
        .getByRole('button', { name: MEANING_OF[word] })
        .click();
      continue;
    }
    let answer: string | undefined;
    if (section === 'Traduction') {
      answer = TERM_OF[(await challenge.getByTestId('challenge-meaning').textContent()) ?? ''];
    } else {
      // A dictated word is read twice, slower first.
      await expect.poll(() => spokenCount(page)).toBeGreaterThanOrEqual(heard + 2);
      answer = await page.evaluate(() => window.spokenTexts.at(-1));
      heard += 2;
    }
    await challenge.getByLabel('Ta réponse').fill(answer ?? '');
    await challenge.getByRole('button', { name: 'Valider' }).click();
  }

  await expect(challenge.getByRole('heading', { name: 'Prêt pour le contrôle' })).toBeVisible();
  await expect(challenge.getByText('Note : 20 sur 20')).toBeAttached();
  await expect(challenge.getByText('/ 20', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
