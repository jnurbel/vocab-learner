import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import fr from '../../i18n/fr.json';
import type { VocabularySave } from '../vocabularySave';
import CsvImport from './CsvImport.svelte';

const now = '2026-11-10T12:00:00.000Z';
const animals: Label = {
  id: 'l-animals',
  name: 'Animaux',
  isFocus: false,
  createdAt: now,
  updatedAt: now,
};
const cat: Card = {
  id: 'card-cat',
  language: 'zh',
  term: '猫',
  translation: 'chat',
  labelIds: [],
  source: 'manual',
  createdAt: now,
  updatedAt: now,
};

function setup() {
  const onSave = vi.fn<(save: VocabularySave) => Promise<void>>(() => Promise.resolve());
  let sequence = 0;
  render(CsvImport, {
    existingCards: [cat],
    existingLabels: [animals],
    loadPinyin: () => Promise.resolve((hanzi: string) => `auto(${hanzi})`),
    newId: () => {
      sequence += 1;
      return `id-${String(sequence)}`;
    },
    clock: () => now,
    onSave,
  });
  return { onSave, user: userEvent.setup() };
}

async function chooseFile(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.upload(
    screen.getByLabelText(fr.csvImport.fileLabel),
    new File([text], 'mots.csv', { type: 'text/csv' }),
  );
}

function preview() {
  return screen.findByRole('table', { name: fr.csvImport.previewCaption });
}

describe('CsvImport', () => {
  it('previews the words of the file, telling the new ones from those already in the list', async () => {
    const { user } = setup();

    await chooseFile(user, 'terme;pinyin;sens;exemple;labels\n狗;gou3;chien;;Animaux\n猫;;chat;;');

    const table = await preview();
    expect(within(table).getByRole('row', { name: /狗/ })).toHaveTextContent(
      fr.csvImport.status.new,
    );
    expect(within(table).getByRole('row', { name: /狗/ })).toHaveTextContent('gǒu');
    expect(within(table).getByRole('row', { name: /猫/ })).toHaveTextContent(
      fr.csvImport.status.existing,
    );
  });

  it('lists the rows to correct, by row', async () => {
    const { user } = setup();

    await chooseFile(user, 'apple;;\npear;;poire');

    expect(await screen.findByRole('list', { name: fr.csvImport.errorsTitle })).toHaveTextContent(
      `Ligne 1 : ${fr.bulkEntry.errors.missingTranslation}`,
    );
  });

  it('imports the words with the labels of their rows and those chosen, the pinyin completed', async () => {
    const { user, onSave } = setup();

    await chooseFile(user, '狗;;chien;Le chien dort.;Animaux, Leçon 2');
    await preview();
    await user.type(screen.getByLabelText(fr.labelPicker.nameInput), 'Fichier');
    await user.click(screen.getByRole('button', { name: fr.csvImport.save }));

    const [saved] = onSave.mock.calls[0] ?? [];
    expect(saved?.newLabel?.name).toBe('Fichier');
    expect(saved?.newLabels?.map(({ name }) => name)).toEqual(['Leçon 2']);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: {
          cardsToCreate: [
            expect.objectContaining({
              term: '狗',
              pinyin: 'auto(狗)',
              translation: 'chien',
              example: 'Le chien dort.',
              source: 'csv',
              labelIds: ['id-1', 'l-animals', 'id-2'],
            }),
          ],
          cardsToUpdate: [],
        },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('1 mot(s) ajouté(s)');
  });

  it('refuses a file whose quotes are broken', async () => {
    const { user } = setup();

    await chooseFile(user, '"apple;pomme');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.csvImport.inputErrors.unclosedQuote,
    );
  });

  it('shows the cells of the file as plain text, never as HTML', async () => {
    const { user } = setup();

    await chooseFile(user, '<img src=x onerror=alert(1)>;;<b>gras</b>');

    expect(await preview()).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });
});
