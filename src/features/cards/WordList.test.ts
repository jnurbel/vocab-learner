import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card, Language } from '../../domain/card';
import type { Label } from '../../domain/label';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';
import WordList from './WordList.svelte';

const now = '2026-11-05T12:00:00.000Z';

function card(id: string, term: string, language: Language, labelIds: string[]): Card {
  return {
    id,
    language,
    term,
    translation: `sens de ${term}`,
    labelIds,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

const labels: Label[] = [
  { id: 'lesson', name: 'Leçon 3', isFocus: false, createdAt: now, updatedAt: now },
  { id: 'animals', name: 'Animaux', isFocus: false, createdAt: now, updatedAt: now },
];
const cards = [
  card('c1', '猫', 'zh', ['lesson', 'animals']),
  card('c2', '书', 'zh', ['lesson']),
  card('c3', 'dog', 'en', ['animals']),
  card('c4', 'apple', 'en', []),
];

function shownTerms(): string[] {
  const table = screen.getByRole('table', { name: fr.wordList.caption });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');
}

describe('WordList', () => {
  it('shows the stage and the thirst of each word as a text badge', () => {
    render(WordList, {
      cards,
      labels,
      progressOf: (shown: Card) =>
        shown.id === 'c1' ? { stage: 'sprout', thirst: 2 } : { stage: 'seed', thirst: 0 },
    });

    const cat = screen.getByRole('row', { name: /猫/ });
    expect(within(cat).getByText('Pousse · très soif')).toBeVisible();
    expect(within(screen.getByRole('row', { name: /书/ })).getByText('Graine')).toBeVisible();
  });

  it('shows every word with the names of its labels by default', () => {
    render(WordList, { cards, labels });

    expect(shownTerms()).toEqual(['猫', '书', 'dog', 'apple']);
    expect(screen.getByRole('row', { name: /猫/ })).toHaveTextContent('Leçon 3, Animaux');
  });

  it('filters the words by label', async () => {
    const user = userEvent.setup();
    render(WordList, { cards, labels });

    await user.selectOptions(screen.getByLabelText(fr.wordList.labelFilter), 'Animaux');

    expect(shownTerms()).toEqual(['猫', 'dog']);
  });

  it('filters the words by language, combined with the label', async () => {
    const user = userEvent.setup();
    render(WordList, { cards, labels });

    await user.selectOptions(screen.getByLabelText(fr.wordList.languageFilter), fr.languages.zh);
    expect(shownTerms()).toEqual(['猫', '书']);

    await user.selectOptions(screen.getByLabelText(fr.wordList.labelFilter), 'Animaux');
    expect(shownTerms()).toEqual(['猫']);
  });

  it('says so when no word matches', () => {
    render(WordList, { cards: [], labels });

    expect(screen.getByText(fr.wordList.empty)).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('opens a word for editing from its row', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(WordList, { cards, labels, onEdit });

    await user.click(
      screen.getByRole('button', { name: format(fr.wordList.editWord, { term: '书' }) }),
    );

    expect(onEdit).toHaveBeenCalledWith(cards[1]);
  });

  it('deletes a word only once the deletion is confirmed', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(() => Promise.resolve());
    render(WordList, { cards, labels, onDelete });

    await user.click(
      screen.getByRole('button', { name: format(fr.wordList.deleteWord, { term: '猫' }) }),
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(format(fr.wordList.confirmDelete, { term: '猫' }))).toBeVisible();
    expect(screen.getByRole('button', { name: fr.confirm.cancel })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: fr.wordList.confirmDeleteButton }));

    expect(onDelete).toHaveBeenCalledWith(cards[0]);
  });

  it('keeps the word when the deletion is cancelled, with the button or Escape', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(() => Promise.resolve());
    render(WordList, { cards, labels, onDelete });
    const deleteCat = screen.getByRole('button', {
      name: format(fr.wordList.deleteWord, { term: '猫' }),
    });

    await user.click(deleteCat);
    await user.click(screen.getByRole('button', { name: fr.confirm.cancel }));
    expect(screen.queryByText(format(fr.wordList.confirmDelete, { term: '猫' }))).toBeNull();

    await user.click(
      screen.getByRole('button', { name: format(fr.wordList.deleteWord, { term: '猫' }) }),
    );
    await user.keyboard('{Escape}');

    expect(screen.queryByText(format(fr.wordList.confirmDelete, { term: '猫' }))).toBeNull();
    expect(
      screen.getByRole('button', { name: format(fr.wordList.deleteWord, { term: '猫' }) }),
    ).toHaveFocus();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows the pinyin with one colour per tone, the tone marks kept', () => {
    const tea = { ...card('c5', '茶叶', 'zh', []), pinyin: 'cháyè' };
    render(WordList, { cards: [tea], labels });

    const row = screen.getByRole('row', { name: /茶叶/ });
    expect(row).toHaveTextContent('cháyè');
    expect(within(row).getByText('chá')).toHaveClass('tone-2');
    expect(within(row).getByText('yè')).toHaveClass('tone-4');
  });
});

describe('WordList export', () => {
  it('exports the words shown, after the filters, as a CSV file', async () => {
    const user = userEvent.setup();
    const onExportCsv = vi.fn();
    render(WordList, { cards, labels, onExportCsv });

    await user.selectOptions(screen.getByLabelText(fr.wordList.labelFilter), 'Animaux');
    await user.click(screen.getByRole('button', { name: fr.csvImport.exportButton }));

    expect(onExportCsv).toHaveBeenCalledWith([
      expect.objectContaining({ term: '猫' }),
      expect.objectContaining({ term: 'dog' }),
    ]);
  });

  it('offers no export where none is wired', () => {
    render(WordList, { cards, labels });

    expect(screen.queryByRole('button', { name: fr.csvImport.exportButton })).toBeNull();
  });
});
