import { expect, test, type Page } from '@playwright/test';
import { useFakePhotoReader } from './fakePhotoReader.ts';
import { openWords } from './navigation.ts';

/**
 * A photo of a printed vocabulary table made by the test itself: drawn on a canvas in the
 * browser, with the system fonts (fonts-wqy-zenhei on the CI, installed by Playwright).
 */
async function printedTable(page: Page, rows: readonly (readonly [string, string])[]) {
  const dataUrl = await page.evaluate((tableRows) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 80 + tableRows.length * 130;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('No canvas');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#555555';
    context.lineWidth = 3;
    context.fillStyle = '#111111';
    context.font = '64px sans-serif';
    context.textBaseline = 'middle';
    tableRows.forEach(([word, meaning], index) => {
      const top = 40 + index * 130;
      context.strokeRect(40, top, 1120, 130);
      context.fillText(word, 80, top + 65);
      context.fillText(meaning, 560, top + 65);
    });
    context.beginPath();
    context.moveTo(500, 40);
    context.lineTo(500, 40 + tableRows.length * 130);
    context.stroke();
    return canvas.toDataURL('image/png');
  }, rows);
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

/** Errors on the console, and every violation of the Content Security Policy, as errors. */
async function watchProblems(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    problems.push(error.message);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(
        `CSP violation: ${event.violatedDirective} ${event.blockedURI} at ${event.sourceFile}:${String(event.lineNumber)}`,
      );
    });
  });
  return problems;
}

async function readPhoto(page: Page, buffer: Buffer) {
  await openWords(page);
  await page.getByRole('tab', { name: 'Photo' }).click();
  const photo = page.getByRole('region', { name: 'Photo' });
  await photo.getByLabel('Choisir ou prendre une photo').setInputFiles({
    name: 'lesson.png',
    mimeType: 'image/png',
    buffer,
  });
  await expect(photo.getByRole('img', { name: 'Aperçu de la photo à lire' })).toBeVisible();
  await photo.getByRole('button', { name: 'Lire la photo' }).click();
}

const cell = (page: Page, column: 'Mot' | 'Pinyin' | 'Sens', line: number) =>
  page.getByRole('textbox', { name: `${column}, ligne ${String(line)}` });

test('a learner photographs a printed table and its words are read on the device', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const problems = await watchProblems(page);
  const requests: string[] = [];
  page.on('request', (request) => {
    requests.push(request.url());
  });
  await page.goto('./');

  await readPhoto(
    page,
    await printedTable(page, [
      ['控制', 'contrôler'],
      ['政府', 'gouvernement'],
      ['家庭', 'famille'],
    ]),
  );

  const words = page.getByRole('region', { name: 'Mots lus sur la photo' });
  await expect(words).toBeVisible({ timeout: 150_000 });
  await expect(cell(page, 'Mot', 1)).toHaveValue('控制');
  await expect(cell(page, 'Mot', 2)).toHaveValue('政府');
  await expect(cell(page, 'Mot', 3)).toHaveValue('家庭');
  await expect(cell(page, 'Pinyin', 2)).toHaveValue('zhèng fǔ');
  // The meanings depend on the fonts of the system that drew the photo: one clear line suffices.
  await expect(cell(page, 'Sens', 2)).toHaveValue('gouvernement');
  await expect(words.getByRole('img', { name: 'Ligne 1 de la photo' })).toBeVisible();

  // Everything came from the app itself or from memory: nothing left the device.
  const origin = new URL(page.url()).origin;
  const local = (url: string) => [origin, 'data:', 'blob:'].some((start) => url.startsWith(start));
  expect(requests.filter((url) => !local(url))).toEqual([]);
  expect(
    requests.some((url) => url.includes('/paddle/models/PP-OCRv5_mobile_det_infer.onnx')),
  ).toBe(true);
  expect(problems).toEqual([]);
});

const NOTEBOOK = {
  size: { width: 1000, height: 400 },
  blocks: [
    { box: { x: 20, y: 40, width: 50, height: 60 }, text: '1' },
    { box: { x: 120, y: 40, width: 180, height: 60 }, text: '控制' },
    { box: { x: 520, y: 40, width: 300, height: 60 }, text: 'contrôler' },
    { box: { x: 20, y: 160, width: 50, height: 60 }, text: '2' },
    { box: { x: 120, y: 160, width: 180, height: 60 }, text: '政府' },
    { box: { x: 520, y: 160, width: 380, height: 60 }, text: 'gouvernemant' },
    { box: { x: 20, y: 280, width: 50, height: 60 }, text: '3' },
    { box: { x: 120, y: 280, width: 180, height: 60 }, text: '家庭' },
    { box: { x: 520, y: 280, width: 300, height: 60 }, text: 'famille' },
  ],
  unsure: ['gouvernemant'],
};

test.describe('with a fake photo reader', () => {
  // The service worker would fetch the reader itself, out of reach of page.route.
  test.use({ serviceWorkers: 'block' });

  test('a learner corrects a line read wrong before adding the words', async ({ page }) => {
    const problems = await watchProblems(page);
    await useFakePhotoReader(page, NOTEBOOK);
    await page.goto('./');

    await readPhoto(page, await printedTable(page, [['控制', 'contrôler']]));
    const words = page.getByRole('region', { name: 'Mots lus sur la photo' });
    await expect(words.getByText('1 case(s) à vérifier, surlignée(s).')).toBeVisible();
    await words.getByRole('button', { name: 'Ligne suivante à vérifier' }).click();
    await expect(cell(page, 'Sens', 2)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('gouvernement');
    await words.getByRole('button', { name: 'Supprimer la ligne 3' }).click();
    await words.getByRole('button', { name: 'Ajouter 2 mots' }).click();
    await expect(words.getByText('2 mot(s) ajouté(s).')).toBeVisible();

    const list = page.getByRole('table', { name: 'Liste des mots' });
    await expect(list.getByRole('row', { name: /政府.*gouvernement/ })).toBeVisible();
    await expect(list.getByRole('row', { name: /家庭/ })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('an expert moves a separator on the photo and the words are read again', async ({
    page,
  }) => {
    const problems = await watchProblems(page);
    await useFakePhotoReader(page, {
      ...NOTEBOOK,
      blocks: [
        ...NOTEBOOK.blocks.filter(({ text }) => text !== '政府' && text !== 'gouvernemant'),
        // The word and its meaning, written close together, read as one block over the separator.
        { box: { x: 120, y: 160, width: 780, height: 60 }, text: '政府 gouvernement' },
      ],
    });
    await page.goto('./');

    await readPhoto(page, await printedTable(page, [['政府', 'gouvernement']]));
    const words = page.getByRole('region', { name: 'Mots lus sur la photo' });
    await expect(cell(page, 'Mot', 2)).toHaveValue('政府');
    await expect(cell(page, 'Sens', 2)).toHaveValue('gouvernement');
    await words.getByRole('button', { name: 'Ajuster les zones (mode expert)' }).click();

    const zones = page.getByRole('region', { name: 'Zones de la photo' });
    const separator = zones.getByRole('separator', { name: 'Séparateur de colonnes 2' });
    const before = Number(await separator.getAttribute('aria-valuenow'));
    await separator.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', String(before + 200));
    await zones.getByRole('button', { name: 'Relire avec ces zones' }).click();

    await expect(cell(page, 'Sens', 2)).toHaveValue('gouver');
    expect(problems).toEqual([]);
  });
});
