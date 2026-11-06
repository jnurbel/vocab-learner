import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';
import WordForm from './WordForm.svelte';

const now = '2026-11-06T09:00:00.000Z';

function setup(options: { cards?: Card[]; labels?: Label[]; card?: Card } = {}) {
  const onSave = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  let sequence = 0;
  render(WordForm, {
    idPrefix: 'test',
    existingCards: options.cards ?? [],
    existingLabels: options.labels ?? [],
    loadPinyin: () => Promise.resolve((hanzi: string) => `auto(${hanzi})`),
    newId: () => {
      sequence += 1;
      return `id-${String(sequence)}`;
    },
    clock: () => now,
    onSave,
    onClose,
    ...(options.card === undefined ? {} : { card: options.card }),
  });
  return { onSave, onClose, user: userEvent.setup() };
}

const animals: Label = {
  id: 'animals',
  name: 'Animaux',
  isFocus: false,
  createdAt: now,
  updatedAt: now,
};

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: 'cat',
    language: 'zh',
    term: '猫',
    pinyin: 'māo',
    translation: 'chat',
    labelIds: [],
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('WordForm, entering one word', () => {
  it('proposes the pinyin of a Chinese word, and lets the learner type it in numbers instead', async () => {
    const { user, onSave } = setup();

    await user.type(screen.getByLabelText(fr.wordForm.term), '猫');
    const pinyin = screen.getByLabelText(fr.wordForm.pinyin);
    await vi.waitFor(() => {
      expect(pinyin).toHaveValue('auto(猫)');
    });
    await user.clear(pinyin);
    await user.type(pinyin, 'mao1');
    await user.type(screen.getByLabelText(fr.wordForm.translation), 'chat');
    await user.click(screen.getByRole('button', { name: fr.wordForm.add }));

    expect(onSave).toHaveBeenCalledWith({
      newLabel: undefined,
      changes: {
        cardsToCreate: [
          expect.objectContaining({ term: '猫', pinyin: 'māo', translation: 'chat' }),
        ],
        cardsToUpdate: [],
      },
    });
  });

  it('asks no pinyin for an English word', async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText(fr.wordForm.term), 'apple');

    expect(screen.queryByLabelText(fr.wordForm.pinyin)).toBeNull();
  });

  it('saves the meaning, the example and the labels, then empties the form for the next word', async () => {
    const { user, onSave } = setup({ labels: [animals] });

    await user.type(screen.getByLabelText(fr.wordForm.term), 'dog');
    await user.type(screen.getByLabelText(fr.wordForm.translation), 'chien');
    await user.type(screen.getByLabelText(fr.wordForm.example), 'The dog barks.');
    await user.click(screen.getByRole('checkbox', { name: 'Animaux' }));
    await user.type(screen.getByLabelText(fr.labelPicker.nameInput), 'Leçon 2');
    await user.click(screen.getByRole('button', { name: fr.wordForm.add }));

    expect(onSave).toHaveBeenCalledWith({
      newLabel: { id: 'id-1', name: 'Leçon 2', isFocus: false, createdAt: now, updatedAt: now },
      changes: {
        cardsToCreate: [
          {
            id: 'id-2',
            language: 'en',
            term: 'dog',
            translation: 'chien',
            example: 'The dog barks.',
            labelIds: ['animals', 'id-1'],
            source: 'manual',
            createdAt: now,
            updatedAt: now,
          },
        ],
        cardsToUpdate: [],
      },
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      format(fr.wordForm.created, { term: 'dog' }),
    );
    expect(screen.getByLabelText(fr.wordForm.term)).toHaveValue('');
    expect(screen.getByLabelText(fr.wordForm.term)).toHaveFocus();
  });

  it('only adds the labels to a word that already exists', async () => {
    const cat = makeCard({});
    const { user, onSave } = setup({ cards: [cat], labels: [animals] });

    await user.type(screen.getByLabelText(fr.wordForm.term), '猫');
    await user.type(screen.getByLabelText(fr.wordForm.translation), 'chat');
    await user.click(screen.getByRole('checkbox', { name: 'Animaux' }));
    await user.click(screen.getByRole('button', { name: fr.wordForm.add }));

    expect(onSave).toHaveBeenCalledWith({
      newLabel: undefined,
      changes: {
        cardsToCreate: [],
        cardsToUpdate: [{ ...cat, labelIds: ['animals'], updatedAt: now }],
      },
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      format(fr.wordForm.labelsAdded, { term: '猫' }),
    );
  });

  it('saves nothing when the word already exists with these labels', async () => {
    const { user, onSave } = setup({ cards: [makeCard({})] });

    await user.type(screen.getByLabelText(fr.wordForm.term), '猫');
    await user.type(screen.getByLabelText(fr.wordForm.translation), 'chat');
    await user.click(screen.getByRole('button', { name: fr.wordForm.add }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      format(fr.wordForm.alreadyPresent, { term: '猫' }),
    );
  });

  it('points to the missing fields and saves nothing', async () => {
    const { user, onSave } = setup();

    await user.click(screen.getByRole('button', { name: fr.wordForm.add }));

    const term = screen.getByLabelText(fr.wordForm.term);
    expect(term).toHaveAttribute('aria-invalid', 'true');
    expect(term).toHaveAccessibleDescription(fr.wordForm.errors.required);
    expect(screen.getByLabelText(fr.wordForm.translation)).toHaveAttribute('aria-invalid', 'true');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows typed markup as plain text and never as HTML', async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText(fr.wordForm.term), '<img src=x onerror=alert(1)>');
    await user.type(screen.getByLabelText(fr.wordForm.translation), 'image');
    await user.click(screen.getByRole('button', { name: fr.wordForm.add }));

    expect(screen.getByRole('status')).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
  });

  it('says so when saving fails', async () => {
    const { user, onSave } = setup();
    onSave.mockRejectedValueOnce(new Error('quota'));

    await user.type(screen.getByLabelText(fr.wordForm.term), 'dog');
    await user.type(screen.getByLabelText(fr.wordForm.translation), 'chien');
    await user.click(screen.getByRole('button', { name: fr.wordForm.add }));

    expect(screen.getByRole('alert')).toHaveTextContent(fr.wordForm.saveFailed);
    expect(screen.getByLabelText(fr.wordForm.term)).toHaveValue('dog');
  });
});
