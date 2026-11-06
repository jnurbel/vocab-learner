import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Texts read by the fake speech synthesis, in order. */
    spokenTexts: string[];
  }
}

/**
 * Replaces the browser's speech synthesis before the app loads: a Chinese and a British voice,
 * and every utterance ends shortly after it starts, as a real one would.
 */
async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    interface FakeUtterance {
      text: string;
      lang: string;
      rate: number;
      voice: unknown;
      onend: (() => void) | null;
      onerror: ((event: { error: string }) => void) | null;
    }
    window.spokenTexts = [];
    const voices = [
      { lang: 'zh-CN', name: 'Fake Chinese', default: false, localService: true, voiceURI: 'zh' },
      { lang: 'en-GB', name: 'Fake English', default: true, localService: true, voiceURI: 'en' },
    ];
    const synthesis = {
      getVoices: () => voices,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      cancel: () => undefined,
      speak: (utterance: FakeUtterance) => {
        window.spokenTexts.push(utterance.text);
        setTimeout(() => utterance.onend?.(), 20);
      },
    };
    class Utterance implements FakeUtterance {
      lang = '';
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(readonly text: string) {}
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synthesis, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: Utterance,
      configurable: true,
    });
  });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
}

async function addWords(page: Page, lines: string, count: number) {
  await page.getByLabel('Un mot par ligne').fill(lines);
  await page.getByRole('button', { name: `Ajouter ${String(count)} mots` }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(
    count + 1,
  );
}

/** The word being dictated: the last text the fake voice read. */
async function lastSpoken(page: Page, count: number): Promise<string> {
  await expect
    .poll(() => page.evaluate(() => window.spokenTexts.length))
    .toBeGreaterThanOrEqual(count);
  return page.evaluate(() => window.spokenTexts.at(-1) ?? '');
}

interface StoredState {
  cardId: string;
  reps: number;
  lastRatedDay?: string;
}

interface StoredSession {
  mode?: string;
  results: { cardId: string; outcome: string; exercise?: string }[];
}

/** Reads a whole object store straight from IndexedDB, as the app stored it. */
function readStore<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const opening = indexedDB.open('vocab-learner-default');
        opening.onerror = () => {
          reject(new Error('Cannot open the database'));
        };
        opening.onsuccess = () => {
          const db = opening.result;
          const reading = db.transaction(name).objectStore(name).getAll();
          reading.onsuccess = () => {
            db.close();
            resolve(reading.result as T[]);
          };
        };
      }),
    storeName,
  );
}

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

test('a keyboard dictation of three words: one right, one same-sounding, one unknown', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await addWords(page, '再 | zài | encore\n猫 | māo | chat\n狗 | gǒu | chien', 3);

  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Dictée' })
    .click();
  const dictation = page.getByRole('region', { name: 'Dictée' });
  await dictation.getByRole('radio', { name: 'Au clavier' }).check();
  await dictation.getByRole('button', { name: 'Commencer la dictée' }).click();
  const field = dictation.getByRole('textbox', { name: 'Ta réponse' });

  // The order of the words is not assumed: each answer depends on the word heard.
  for (let position = 1; position <= 3; position++) {
    await expect(dictation.getByRole('status')).toHaveText(`Mot ${String(position)} sur 3`);
    await expect(field).toBeFocused();
    const word = await lastSpoken(page, position);
    if (word === '再') {
      await field.fill('在');
      await field.press('Enter');
      await expect(dictation.getByText('Faux. La réponse était 再.')).toBeVisible();
      await expect(
        dictation.getByText('Bon son, mauvais caractère : 在 au lieu de 再.'),
      ).toBeVisible();
      await expect(dictation.getByRole('listitem', { name: '在, faux, attendu 再' })).toBeVisible();
    } else if (word === '猫') {
      await field.fill('猫');
      await field.press('Enter');
      await expect(dictation.getByText('Juste.')).toBeVisible();
    } else {
      expect(word).toBe('狗');
      await dictation.getByRole('button', { name: 'Je ne sais pas' }).click();
      await expect(dictation.getByText('Faux. La réponse était 狗.')).toBeVisible();
    }
    await dictation.getByRole('button', { name: 'Continuer' }).click();
  }

  await expect(dictation.getByRole('heading', { name: 'Dictée terminée' })).toBeVisible();
  await expect(dictation.getByText('Score : 1 / 3')).toBeVisible();
  const mistakes = dictation.getByRole('list', { name: 'Mots à revoir' });
  await expect(mistakes.getByRole('listitem')).toHaveCount(2);
  await expect(mistakes).toContainText('再');
  await expect(mistakes).toContainText('狗');

  const sessions = await readStore<StoredSession>(page, 'sessions');
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.mode).toBe('dictation');
  expect(sessions[0]?.results.map(({ exercise }) => exercise)).toEqual([
    'listenType',
    'listenType',
    'listenType',
  ]);
  expect(errors).toEqual([]);
});

test('a dictation on paper, then the learner marks each word', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await addWords(page, '再 | zài | encore\n猫 | māo | chat', 2);

  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Dictée' })
    .click();
  const dictation = page.getByRole('region', { name: 'Dictée' });
  await dictation.getByRole('radio', { name: 'Sur papier' }).check();
  await dictation
    .getByRole('combobox', { name: 'Pause entre les mots (sur papier)' })
    .selectOption('manual');
  await dictation.getByRole('button', { name: 'Commencer la dictée' }).click();

  await expect(dictation.getByRole('status')).toHaveText('Mot 1 sur 2');
  await expect(dictation.getByText('Écris le mot sur ta feuille.')).toBeVisible();
  // Space pauses and resumes, the right arrow moves on.
  await page.keyboard.press('Space');
  await expect(dictation.getByText('En pause')).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await expect(dictation.getByRole('status')).toHaveText('Mot 2 sur 2');
  await dictation.getByRole('button', { name: 'Suivant' }).click();

  await expect(dictation.getByRole('heading', { name: 'Correction' })).toBeVisible();
  const submit = dictation.getByRole('button', { name: 'Valider la correction' });
  await expect(submit).toBeDisabled();
  await dictation.getByRole('group', { name: /再/ }).getByRole('radio', { name: 'Juste' }).check();
  await dictation.getByRole('group', { name: /猫/ }).getByRole('radio', { name: 'Faux' }).check();
  await submit.click();

  await expect(dictation.getByText('Score : 1 / 2')).toBeVisible();
  await expect(dictation.getByRole('list', { name: 'Mots à revoir' })).toContainText('猫');
  expect(errors).toEqual([]);
});

test('a word already rated today is not rated twice by a second dictation', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await page.getByLabel('Un mot par ligne').fill('猫 | māo | chat');
  await page.getByRole('button', { name: 'Ajouter 1 mot' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(2);

  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Dictée' })
    .click();
  const dictation = page.getByRole('region', { name: 'Dictée' });
  await dictation.getByRole('radio', { name: 'Au clavier' }).check();
  const field = dictation.getByRole('textbox', { name: 'Ta réponse' });

  await dictation.getByRole('button', { name: 'Commencer la dictée' }).click();
  await field.fill('猫');
  await field.press('Enter');
  await dictation.getByRole('button', { name: 'Continuer' }).click();
  await expect(dictation.getByText('Score : 1 / 1')).toBeVisible();
  const [first] = await readStore<StoredState>(page, 'reviewStates');
  expect(first?.reps).toBe(1);

  await dictation.getByRole('button', { name: 'Nouvelle dictée' }).click();
  await dictation.getByRole('button', { name: 'Commencer la dictée' }).click();
  await field.fill('狗');
  await field.press('Enter');
  await dictation.getByRole('button', { name: 'Continuer' }).click();
  await expect(dictation.getByText('Score : 0 / 1')).toBeVisible();

  const states = await readStore<StoredState>(page, 'reviewStates');
  expect(states).toHaveLength(1);
  expect(states[0]).toEqual(first);
  const sessions = await readStore<StoredSession>(page, 'sessions');
  expect(sessions.map(({ results }) => results.map(({ outcome }) => outcome)).sort()).toEqual([
    ['correct'],
    ['wrong'],
  ]);
  expect(errors).toEqual([]);
});
