import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Card, Language } from '../../domain/card';
import type { Label } from '../../domain/label';
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
});
