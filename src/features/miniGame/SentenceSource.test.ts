import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { bankSentence } from './sentence.fixtures';
import SentenceSource from './SentenceSource.svelte';

describe('SentenceSource', () => {
  it('credits the author of the sentence and of its translation, with links to their pages', () => {
    render(SentenceSource, { sentence: bankSentence(5, '我 来 了 。') });

    const source = screen.getByText(/Phrase : Tatoeba/);
    expect(source).toHaveTextContent(
      'Phrase : Tatoeba n° 5 par sysko · Traduction : n° 1005 par Scott · CC BY 2.0 FR',
    );
    expect(screen.getByRole('link', { name: 'n° 5' })).toHaveAttribute(
      'href',
      'https://tatoeba.org/fr/sentences/show/5',
    );
    expect(screen.getByRole('link', { name: 'n° 1005' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(source).not.toHaveTextContent('convertie');
  });

  it('says when the sentence was converted to simplified characters, and a CC0 one', () => {
    render(SentenceSource, { sentence: { ...bankSentence(6, '我 来 了 。'), cc0: true } });

    expect(screen.getByText(/Phrase : Tatoeba/)).toHaveTextContent(
      'CC BY 2.0 FR, aussi CC0 · convertie en simplifié',
    );
  });
});
