import { expect, test, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';

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

/** Waits for a new word to be spoken, and gives it: the options' order is never assumed. */
async function nextSpoken(page: Page, alreadySpoken: number): Promise<string> {
  await expect
    .poll(() => page.evaluate(() => window.spokenTexts.length))
    .toBeGreaterThan(alreadySpoken);
  return page.evaluate(() => window.spokenTexts.at(-1) ?? '');
}

test('ListenMeaning: a right answer, then a wrong one, heard through the speech synthesis', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await installFakeSpeech(page);
  await page.goto('./');
  await openWords(page);
  await page
    .getByLabel('Un mot par ligne')
    .fill('猫 | mao1 | chat\n狗 | gou3 | chien\n鸟 | niao3 | oiseau\n鱼 | yu2 | poisson');
  await page.getByRole('button', { name: 'Ajouter 4 mots' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(5);

  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Jardin' })
    .click();
  await page.getByRole('button', { name: 'Mini-jeu' }).click();
  const game = page.getByRole('region', { name: 'Mini-jeu : écouter et choisir le sens' });
  await game.getByRole('button', { name: 'Commencer le mini-jeu' }).click();
  const options = game.getByRole('group', { name: 'Que veut dire ce mot ?' });

  // Right answer: the meaning of the word heard.
  const first = await nextSpoken(page, 0);
  await expect(game.getByText(first, { exact: true })).toHaveCount(0);
  await options.getByRole('button', { name: MEANING_OF[first] }).click();
  await expect(game.getByRole('status')).toContainText(`Juste. ${first}`);

  // A right answer replays nothing: the next question speaks the second word read.
  const second = await nextSpoken(page, 1);
  await expect(game.getByRole('status')).toHaveCount(0);
  const wrong = options.getByRole('button').filter({ hasNotText: MEANING_OF[second] }).first();
  await wrong.click();
  await expect(game.getByRole('status')).toContainText(`C'était ${second}`);
  await expect(game.getByRole('status')).toContainText('Tu as choisi');
  await expect(game.getByRole('button', { name: 'Continuer' })).toBeFocused();

  expect(errors).toEqual([]);
});
