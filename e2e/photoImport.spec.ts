import { expect, test, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';

/**
 * A photo of printed Chinese and English made by the test itself: drawn on a canvas in the
 * browser, with the system fonts (fonts-wqy-zenhei on the CI, installed by Playwright).
 */
async function printedTextImage(page: Page, lines: readonly string[]): Promise<Buffer> {
  const dataUrl = await page.evaluate((textLines) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 120 + textLines.length * 110;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('No canvas');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111111';
    context.font = '64px sans-serif';
    context.textBaseline = 'top';
    textLines.forEach((line, index) => {
      context.fillText(line, 60, 60 + index * 110);
    });
    return canvas.toDataURL('image/png');
  }, lines);
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

/**
 * The WebAssembly reader writes on the error console that the LSTM models lack the parameters of
 * its older engine: expected, and harmless.
 */
const READER_NOTICE = /^Warning: Parameter not found: [a-z_]+$/;

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !READER_NOTICE.test(message.text())) {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    problems.push(error.message);
  });
  return problems;
}

test('a learner photographs a printed text and the new words are read on the device', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = collectProblems(page);
  const requests: string[] = [];
  page.on('request', (request) => {
    requests.push(request.url());
  });
  await page.goto('./');
  await page.evaluate(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await openWords(page);

  await page.getByRole('tab', { name: 'Photo' }).click();
  const photo = page.getByRole('region', { name: 'Photo' });
  await expect(photo).toContainText(
    "Marche bien sur du texte imprimé net, mal sur l'écriture à la main.",
  );
  await photo.getByLabel('Choisir ou prendre une photo').setInputFiles({
    name: 'lesson.png',
    mimeType: 'image/png',
    buffer: await printedTextImage(page, ['我们吃月饼。', 'The moon is bright.']),
  });
  await expect(photo.getByRole('img', { name: 'Aperçu de la photo à lire' })).toBeVisible();
  await photo.getByRole('radio', { name: 'Un texte' }).check();
  await photo.getByRole('button', { name: 'Lire la photo' }).click();
  await expect(photo.getByRole('progressbar', { name: 'Lecture de la photo' })).toBeVisible();

  const read = page.getByRole('region', { name: 'Texte lu sur la photo' });
  await expect(read).toBeVisible({ timeout: 90_000 });
  const preview = read.getByRole('table', { name: /Mots nouveaux du texte/ });
  await expect(preview.locator('.term:text-is("月饼")')).toBeVisible();
  await expect(preview.locator('.term:text-is("moon")')).toBeVisible();

  // Everything came from the app itself or from memory (the preview): nothing left the device.
  const origin = new URL(page.url()).origin;
  const local = (url: string) => [origin, 'data:', 'blob:'].some((start) => url.startsWith(start));
  expect(requests.filter((url) => !local(url))).toEqual([]);
  expect(requests.some((url) => url.includes('/tesseract/lang/chi_sim.traineddata.gz'))).toBe(true);
  expect(problems).toEqual([]);
});
