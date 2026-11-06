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
});
