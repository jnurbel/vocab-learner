import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Texts read by the fake speech synthesis, in order. */
    spokenTexts: string[];
  }
}

/**
 * Replaces the browser's speech synthesis before the app loads, with a Chinese and a British
 * voice. The blank utterance that unlocks speech on phones is not recorded: it is not a word.
 */
export async function installFakeSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface FakeUtterance {
      text: string;
      onend: (() => void) | null;
    }
    window.spokenTexts = [];
    const voices = [
      { lang: 'zh-CN', name: 'Fake Chinese', default: true, localService: true, voiceURI: 'zh' },
      { lang: 'en-GB', name: 'Fake English', default: false, localService: true, voiceURI: 'en' },
    ];
    const synthesis = {
      getVoices: () => voices,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      cancel: () => undefined,
      speak: (utterance: FakeUtterance) => {
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

export function spokenCount(page: Page): Promise<number> {
  return page.evaluate(() => window.spokenTexts.length);
}

/** Waits for a new text to be spoken after `alreadySpoken` texts, and gives it. */
export async function nextSpoken(page: Page, alreadySpoken: number): Promise<string> {
  await expect.poll(() => spokenCount(page)).toBeGreaterThan(alreadySpoken);
  return page.evaluate(() => window.spokenTexts.at(-1) ?? '');
}

/** Opens a game of the list of mini-games, from the garden, in the language given. */
export async function openMiniGame(
  page: Page,
  name: string,
  language: 'Chinois' | 'Anglais' = 'Chinois',
): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Jardin' })
    .click();
  await page.getByRole('button', { name: 'Mini-jeu' }).click();
  await page.getByRole('radio', { name: language }).check();
  await page.getByRole('button', { name: `Jouer ${name}` }).click();
}
