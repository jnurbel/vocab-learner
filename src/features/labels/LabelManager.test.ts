import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';
import LabelManager from './LabelManager.svelte';

const now = '2026-11-06T09:00:00.000Z';
const before = '2026-01-01T00:00:00.000Z';

function label(id: string, name: string): Label {
  return { id, name, isFocus: false, createdAt: before, updatedAt: before };
}

function card(id: string, labelIds: string[]): Card {
  return {
    id,
    language: 'zh',
    term: id,
    translation: id,
    labelIds,
    source: 'manual',
    createdAt: before,
    updatedAt: before,
  };
}

const lesson = label('lesson', 'Leçon 3');
const animals = label('animals', 'Animaux');
const cat = card('猫', ['lesson', 'animals']);
const dog = card('狗', ['animals']);

function setup(labels: Label[] = [lesson, animals], cards: Card[] = [cat, dog]) {
  const onChange = vi.fn(() => Promise.resolve());
  render(LabelManager, { labels, cards, clock: () => now, onChange });
  return { onChange, user: userEvent.setup() };
}

function rowOf(name: string): HTMLElement {
  const table = screen.getByRole('table', { name: fr.labelManager.caption });
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByRole('rowheader', { name }) !== null);
  if (row === undefined) {
    throw new Error(`No row for ${name}`);
  }
  return row;
}

describe('LabelManager', () => {
  it('lists the labels in alphabetical order with their number of words', () => {
    setup();

    const rowHeaders = screen.getAllByRole('rowheader').map((header) => header.textContent);
    expect(rowHeaders).toEqual(['Animaux', 'Leçon 3']);
    expect(rowOf('Animaux')).toHaveTextContent(format(fr.labelManager.count, { count: 2 }));
    expect(rowOf('Leçon 3')).toHaveTextContent(format(fr.labelManager.count, { count: 1 }));
  });

  it('says so when there is no label yet', () => {
    setup([], []);

    expect(screen.getByText(fr.labelManager.empty)).toBeVisible();
  });

  it('renames a label', async () => {
    const { user, onChange } = setup();

    await user.type(
      screen.getByLabelText(format(fr.labelManager.renameInput, { name: 'Leçon 3' })),
      'Leçon 3 : la ville',
    );
    await user.click(
      screen.getByRole('button', {
        name: format(fr.labelManager.renameLabel, { name: 'Leçon 3' }),
      }),
    );

    expect(onChange).toHaveBeenCalledWith({
      labels: [{ ...lesson, name: 'Leçon 3 : la ville', updatedAt: now }, animals],
      cardsToUpdate: [],
    });
  });

  it('refuses a name that another label already has', async () => {
    const { user, onChange } = setup();

    await user.type(
      screen.getByLabelText(format(fr.labelManager.renameInput, { name: 'Leçon 3' })),
      'animaux',
    );
    await user.click(
      screen.getByRole('button', {
        name: format(fr.labelManager.renameLabel, { name: 'Leçon 3' }),
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(fr.labelManager.errors.nameTaken);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('merges a label into another once confirmed: the words keep both lessons in one label', async () => {
    const { user, onChange } = setup();

    await user.selectOptions(
      screen.getByLabelText(format(fr.labelManager.mergeSelect, { name: 'Animaux' })),
      'Leçon 3',
    );
    await user.click(
      screen.getByRole('button', { name: format(fr.labelManager.mergeLabel, { name: 'Animaux' }) }),
    );
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: fr.labelManager.confirmMergeButton }));

    expect(onChange).toHaveBeenCalledWith({
      labels: [lesson],
      cardsToUpdate: [
        { ...cat, labelIds: ['lesson'], updatedAt: now },
        { ...dog, labelIds: ['lesson'], updatedAt: now },
      ],
    });
  });

  it('cannot merge before a target label is chosen', () => {
    setup();

    expect(
      screen.getByRole('button', { name: format(fr.labelManager.mergeLabel, { name: 'Animaux' }) }),
    ).toBeDisabled();
  });

  it('deletes a label once confirmed, keeping its words', async () => {
    const { user, onChange } = setup();

    await user.click(
      screen.getByRole('button', {
        name: format(fr.labelManager.deleteLabel, { name: 'Animaux' }),
      }),
    );
    expect(
      screen.getByText(format(fr.labelManager.confirmDelete, { name: 'Animaux', count: 2 })),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.labelManager.confirmDeleteButton }));

    expect(onChange).toHaveBeenCalledWith({
      labels: [lesson],
      cardsToUpdate: [
        { ...cat, labelIds: ['lesson'], updatedAt: now },
        { ...dog, labelIds: [], updatedAt: now },
      ],
    });
  });

  it('says so when a change cannot be saved', async () => {
    const { user, onChange } = setup();
    onChange.mockRejectedValueOnce(new Error('quota'));

    await user.type(
      screen.getByLabelText(format(fr.labelManager.renameInput, { name: 'Animaux' })),
      'Bêtes',
    );
    await user.click(
      screen.getByRole('button', {
        name: format(fr.labelManager.renameLabel, { name: 'Animaux' }),
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.labelManager.saveFailed);
  });
});
