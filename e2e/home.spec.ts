import { expect, type Page, test } from '@playwright/test';
import { openWords } from './navigation.ts';

test.use({ timezoneId: 'Europe/Paris' });

const LESSON = { 猫: 'chat', 狗: 'chien', 鱼: 'poisson' } as const;
const OTHERS = { 书: 'livre', 笔: 'stylo' } as const;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function addWords(page: Page, words: Record<string, string>, labelName: string) {
  const lines = Object.entries(words)
    .map(([term, meaning]) => `${term} || ${meaning}`)
    .join('\n');
  const count = Object.keys(words).length;
  const bulkEntry = page.getByRole('region', { name: 'Saisie en lot' });
  await bulkEntry.getByLabel('Un mot par ligne').fill(lines);
  await expect(bulkEntry.getByLabel('Pinyin, ligne 1')).not.toHaveValue('');
  await bulkEntry.getByLabel('Nouveau label ou label existant (facultatif)').fill(labelName);
  await bulkEntry.getByRole('button', { name: `Ajouter ${String(count)} mots` }).click();
  await expect(bulkEntry.getByRole('status')).toHaveText(`${String(count)} mot(s) ajouté(s).`);
}

async function setTestDate(page: Page, labelName: string, day: string) {
  const manager = page.getByRole('region', { name: 'Mes labels' });
  await manager.getByLabel(`Date du contrôle de ${labelName}`).fill(day);
  await expect(manager.getByRole('status')).toHaveText('Labels mis à jour.');
  await expect(manager.getByRole('button', { name: `Désépingler ${labelName}` })).toBeVisible();
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu' });

test('a learner pins a label with a test in 3 days and works on its words first from the home screen', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(new Date('2026-11-06T10:00:00+01:00'));
  await page.goto('./');
  await openWords(page);
  await addWords(page, LESSON, 'Leçon 7');
  await addWords(page, OTHERS, 'Divers');
  await setTestDate(page, 'Leçon 7', '2026-11-09');

  await menu(page).getByRole('button', { name: 'Accueil' }).click();
  const card = page.getByRole('region', { name: 'Leçon 7' });
  await expect(card.getByText('3 mots', { exact: true })).toBeVisible();
  await expect(card.getByText('Contrôle dans 3 jours · lun. 9 nov.')).toBeVisible();
  await expect(card.getByRole('img', { name: '0 mot maîtrisé sur 3, soit 0 %' })).toBeVisible();
  await expect(card.getByText('0 / 3 mots maîtrisés.')).toBeVisible();
  await expect(card).toContainText(/Au rythme prévu|serré/);
  await expect(card.getByText('3 nouveaux mots')).toBeVisible();

  await page.getByRole('button', { name: /^Commencer la session · ~\d+ min$/ }).click();
  const flashcards = page.getByRole('region', { name: 'Flashcards' });
  await expect(flashcards.getByText('1 / 3')).toBeVisible();

  // The order of the cards is drawn from the session seed: never assume it, only check that
  // every card proposed belongs to the pinned label.
  const seen: string[] = [];
  for (let position = 1; position <= 3; position += 1) {
    await expect(flashcards.getByText(`${String(position)} / 3`)).toBeVisible();
    await page.keyboard.press('Space');
    const meaning = flashcards.getByText(/^(chat|chien|poisson|livre|stylo)$/);
    await expect(meaning).toBeVisible();
    seen.push((await meaning.textContent()) ?? '');
    await page.keyboard.press('3');
  }
  await expect(page.getByRole('heading', { name: 'Session terminée' })).toBeVisible();
  expect(seen.toSorted()).toEqual(Object.values(LESSON).toSorted());
  expect(errors).toEqual([]);
});

test('the label is unpinned the day after its test, and the unpinning can be undone', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(new Date('2026-11-06T10:00:00+01:00'));
  await page.goto('./');
  await openWords(page);
  await addWords(page, LESSON, 'Leçon 7');
  await setTestDate(page, 'Leçon 7', '2026-11-07');

  await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+01:00'));
  await page.reload();

  const banner = page.getByRole('region', { name: 'Contrôles passés' });
  await expect(banner).toContainText(
    '« Leçon 7 » : contrôle passé (sam. 7 nov.), label désépinglé.',
  );
  await expect(page.getByRole('region', { name: 'Leçon 7' })).toHaveCount(0);

  await banner.getByRole('button', { name: 'Annuler le désépinglage de Leçon 7' }).click();
  await expect(page.getByRole('region', { name: 'Leçon 7' })).toBeVisible();
  await expect(banner).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('region', { name: 'Leçon 7' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Contrôles passés' })).toHaveCount(0);
  await openWords(page);
  await expect(page.getByRole('button', { name: 'Désépingler Leçon 7' })).toBeVisible();
  expect(errors).toEqual([]);
});
