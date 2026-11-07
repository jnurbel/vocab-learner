import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import type { ReviewState } from '../../domain/srs/reviewState';
import { card, srs } from '../flashcards/flashcards.fixtures';
import Garden from './Garden.svelte';

const moment = { now: new Date('2026-11-07T08:00:00Z'), today: '2026-11-07' };

function state(cardId: string, overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    cardId,
    due: '2026-11-20T08:00:00.000Z',
    stability: 25,
    difficulty: 5,
    reps: 6,
    lapses: 0,
    state: 'review',
    lastReviewAt: '2026-11-01T08:00:00.000Z',
    successDays: 4,
    peakStage: 'flower',
    ...overrides,
  };
}

const lesson: Label = {
  id: 'lesson7',
  name: 'Leçon 7',
  isFocus: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const weather = card('weather', undefined, {
  term: '天气',
  translation: 'temps',
  labelIds: ['lesson7'],
});
const cold = card('cold', undefined, { term: '冷', translation: 'froid' });
const snow = card('snow', undefined, { language: 'en', term: 'snow', translation: 'neige' });

function setup({
  cards = [weather, cold, snow],
  states = [state('weather'), state('snow', { due: '2026-11-06T08:00:00.000Z', peakStage: 'bud' })],
  xp = 1240,
}: { cards?: Card[]; states?: ReviewState[]; xp?: number } = {}) {
  const onWater = vi.fn();
  const onMiniGame = vi.fn();
  render(Garden, {
    cards,
    labels: [lesson],
    reviewStates: states,
    moment,
    srs,
    progress: { xp },
    onWater,
    onMiniGame,
  });
  return { onWater, onMiniGame, user: userEvent.setup() };
}

describe('Garden', () => {
  it('shows the island level and points, and how many plants bloom or are thirsty', () => {
    setup();

    expect(screen.getByText('Île niveau 6 · 1240 XP')).toBeVisible();
    expect(screen.getByText('1 fleur')).toBeVisible();
    expect(screen.getByText('1 plante a soif')).toBeVisible();
  });

  it('draws a Chinese plot and an English plot, each word with its stage in words', () => {
    setup();

    const chinese = screen.getByRole('list', { name: 'Parcelle 中文' });
    expect(within(chinese).getByText('天气')).toHaveAttribute('lang', 'zh-CN');
    expect(within(chinese).getByText('Fleur')).toBeVisible();
    expect(within(chinese).getByText('Graine')).toBeVisible();
    const english = screen.getByRole('list', { name: 'Parcelle English' });
    expect(within(english).getByText('snow')).toHaveAttribute('lang', 'en');
  });

  it('marks a thirsty plant with an icon and a text, never the colour alone', () => {
    setup();

    const english = screen.getByRole('list', { name: 'Parcelle English' });
    expect(within(english).getByText('a soif')).toBeInTheDocument();
  });

  it('shows a plant whose stage went down as wilted, keeping its size', () => {
    setup({ states: [state('weather', { stability: 2 })] });

    expect(screen.getByText('Fleur · fanée')).toBeVisible();
  });

  it('explains the stages in a legend', () => {
    setup();

    const legend = screen.getByRole('list', { name: 'Les stades' });
    expect(within(legend).getAllByRole('listitem')).toHaveLength(6);
    expect(within(legend).getByText(/Lanterne/)).toBeVisible();
  });

  it('announces the next unlock with its exact condition', () => {
    setup();

    // Level 7 at 1350 XP: 110 to go.
    expect(screen.getByText('Niveau 7 : Cerf-volant, encore 110 XP')).toBeVisible();
    expect(screen.getByText('Une luciole tous les 10 mots en fleur : 1 / 10')).toBeVisible();
  });

  it('waters the thirsty words, or opens the mini-game', async () => {
    const { user, onWater, onMiniGame } = setup();

    await user.click(screen.getByRole('button', { name: 'Arroser (réviser)' }));
    await user.click(screen.getByRole('button', { name: 'Mini-jeu' }));

    expect(onWater).toHaveBeenCalledOnce();
    expect(onMiniGame).toHaveBeenCalledOnce();
  });

  it('offers a list view giving every word, stage, thirst and next review in text', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Vue liste' }));

    const table = screen.getByRole('table', { name: 'Mots du jardin' });
    expect(within(table).getByRole('row', { name: /天气/ })).toHaveTextContent(
      /天气.*Fleur.*Pas soif.*20 nov/,
    );
    expect(within(table).getByRole('row', { name: /snow/ })).toHaveTextContent(/Bouton.*A soif/);
    expect(within(table).getByRole('row', { name: /冷/ })).toHaveTextContent(/Graine.*Pas soif.*—/);
    expect(screen.getByRole('button', { name: 'Vue liste' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('filters the plants by label', async () => {
    const { user } = setup();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Label' }), 'lesson7');

    const chinese = screen.getByRole('list', { name: 'Parcelle 中文' });
    expect(within(chinese).getByText('天气')).toBeVisible();
    expect(within(chinese).queryByText('冷')).toBeNull();
  });

  it('pages through many words instead of drawing them all', async () => {
    const many = Array.from({ length: 130 }, (_, index) =>
      card(`w${String(index)}`, undefined, { term: `词${String(index)}` }),
    );
    const { user } = setup({ cards: many, states: [] });

    const chinese = screen.getByRole('list', { name: 'Parcelle 中文' });
    expect(within(chinese).getAllByRole('listitem')).toHaveLength(48);
    expect(screen.getByText('Page 1 / 3')).toBeVisible();

    await user.click(screen.getAllByRole('button', { name: 'Page suivante' })[0]!);

    expect(screen.getByText('Page 2 / 3')).toBeVisible();
    expect(within(chinese).getByText('词48')).toBeVisible();
  });

  it('invites to add words when the garden is empty', () => {
    setup({ cards: [], states: [] });

    expect(
      screen.getByText('Ton île est encore nue. Ajoute tes premiers mots pour semer.'),
    ).toBeVisible();
  });
});
