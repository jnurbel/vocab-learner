import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import fr from '../../i18n/fr.json';
import BulkEntry from './BulkEntry.svelte';

const now = '2026-11-05T12:00:00.000Z';

function setup(options: { cards?: Card[]; labels?: Label[] } = {}) {
  const onSave = vi.fn(() => Promise.resolve());
  let sequence = 0;
  render(BulkEntry, {
    existingCards: options.cards ?? [],
    existingLabels: options.labels ?? [],
    generatePinyin: (hanzi: string) => `auto(${hanzi})`,
    newId: () => {
      sequence += 1;
      return `id-${String(sequence)}`;
    },
    clock: () => now,
    onSave,
  });
  return { onSave, user: userEvent.setup() };
}

async function typeLines(user: ReturnType<typeof userEvent.setup>, text: string) {
  const textarea = screen.getByLabelText(fr.bulkEntry.inputLabel);
  await user.click(textarea);
  await user.paste(text);
}

describe('BulkEntry', () => {
  it('previews the new words with their generated or converted pinyin', async () => {
    const { user } = setup();

    await typeLines(user, '你好 || bonjour\n谢谢 | xie4xie | merci\napple | pomme');

    const preview = screen.getByRole('table', { name: fr.bulkEntry.newWordsCaption });
    expect(preview).toHaveTextContent('auto(你好)');
    expect(preview).toHaveTextContent('xièxie');
    expect(preview).toHaveTextContent('apple');
    expect(screen.getByRole('button', { name: 'Ajouter 3 mots' })).toBeEnabled();
  });

  it('lists line errors in French with their line number', async () => {
    const { user } = setup();

    await typeLines(user, 'apple | pomme\npear\n\n你好 | nǐ hǎo | bonjour | salut');

    const errors = screen.getByRole('list', { name: fr.bulkEntry.errorsTitle });
    expect(errors).toHaveTextContent(`Ligne 2 : ${fr.bulkEntry.errors.missingTranslation}`);
    expect(errors).toHaveTextContent(`Ligne 4 : ${fr.bulkEntry.errors.tooManyColumns}`);
    expect(screen.getByRole('button', { name: 'Ajouter 1 mot' })).toBeEnabled();
  });

  it('shows typed markup as plain text and never as HTML', async () => {
    const { user } = setup();

    await typeLines(user, '<img src=x onerror=alert(1)> | <b>gras</b>');

    expect(screen.getByRole('table')).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });

  it('signals words that already exist instead of adding them again', async () => {
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
    const { user } = setup({ cards: [cat] });

    await typeLines(user, '猫 || chat\n狗 || chien');

    expect(screen.getByText(fr.bulkEntry.existingWords.replace('{count}', '1'))).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ajouter 1 mot' })).toBeEnabled();
  });

  it('saves the new words with the label typed, reusing an existing label of that name', async () => {
    const animals: Label = {
      id: 'label-animals',
      name: 'Animaux',
      isFocus: false,
      createdAt: now,
      updatedAt: now,
    };
    const { user, onSave } = setup({ labels: [animals] });

    await typeLines(user, '狗 || chien');
    await user.type(screen.getByLabelText(fr.bulkEntry.labelInput), 'animaux');
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 mot' }));

    expect(onSave).toHaveBeenCalledWith({
      newLabel: undefined,
      changes: {
        cardsToCreate: [
          expect.objectContaining({ term: '狗', pinyin: 'auto(狗)', labelIds: ['label-animals'] }),
        ],
        cardsToUpdate: [],
      },
    });
  });

  it('creates the typed label when it does not exist yet', async () => {
    const { user, onSave } = setup();

    await typeLines(user, 'apple | pomme');
    await user.type(screen.getByLabelText(fr.bulkEntry.labelInput), 'Fruits');
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 mot' }));

    expect(onSave).toHaveBeenCalledWith({
      newLabel: { id: 'id-1', name: 'Fruits', isFocus: false, createdAt: now, updatedAt: now },
      changes: {
        cardsToCreate: [expect.objectContaining({ id: 'id-2', term: 'apple', labelIds: ['id-1'] })],
        cardsToUpdate: [],
      },
    });
  });

  it('blocks saving while the label name is too long', async () => {
    const { user, onSave } = setup();

    await typeLines(user, 'apple | pomme');
    await user.click(screen.getByLabelText(fr.bulkEntry.labelInput));
    await user.paste('L'.repeat(61));

    expect(screen.getByRole('alert')).toHaveTextContent(fr.bulkEntry.labelErrors.tooLong);
    expect(screen.getByRole('button', { name: 'Ajouter 1 mot' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses an input that is too long, without saving anything', async () => {
    const { user } = setup();

    await typeLines(user, 'a'.repeat(20_001));

    expect(screen.getByRole('alert')).toHaveTextContent(fr.bulkEntry.inputErrors.inputTooLong);
    expect(screen.getByRole('button', { name: /Ajouter/ })).toBeDisabled();
  });

  it('puts several existing labels, chosen with checkboxes, and a new one on the words', async () => {
    const animals = makeLabel('label-animals', 'Animaux');
    const lesson = makeLabel('label-lesson', 'Leçon 3');
    const { user, onSave } = setup({ labels: [animals, lesson] });

    await typeLines(user, '狗 || chien');
    await user.click(screen.getByRole('checkbox', { name: 'Animaux' }));
    await user.click(screen.getByRole('checkbox', { name: 'Leçon 3' }));
    await user.type(screen.getByLabelText(fr.bulkEntry.labelInput), 'Verbes');
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 mot' }));

    expect(onSave).toHaveBeenCalledWith({
      newLabel: makeLabel('id-1', 'Verbes'),
      changes: {
        cardsToCreate: [
          expect.objectContaining({ labelIds: ['label-animals', 'label-lesson', 'id-1'] }),
        ],
        cardsToUpdate: [],
      },
    });
  });

  it('only adds the chosen labels when every word already exists', async () => {
    const animals = makeLabel('label-animals', 'Animaux');
    const cat = makeCard('card-cat', '猫');
    const { user, onSave } = setup({ cards: [cat], labels: [animals] });

    await typeLines(user, '猫 || chat');
    expect(screen.getByRole('button', { name: fr.bulkEntry.addLabelsOnly })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Animaux' }));
    await user.click(screen.getByRole('button', { name: fr.bulkEntry.addLabelsOnly }));

    expect(onSave).toHaveBeenCalledWith({
      newLabel: undefined,
      changes: {
        cardsToCreate: [],
        cardsToUpdate: [{ ...cat, labelIds: ['label-animals'], updatedAt: now }],
      },
    });
  });
});

function makeLabel(id: string, name: string): Label {
  return { id, name, isFocus: false, createdAt: now, updatedAt: now };
}

function makeCard(id: string, term: string): Card {
  return {
    id,
    language: 'zh',
    term,
    translation: term,
    labelIds: [],
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}
