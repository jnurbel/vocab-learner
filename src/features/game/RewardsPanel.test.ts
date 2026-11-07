import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RewardsPanel from './RewardsPanel.svelte';
import type { RewardsSummary } from './sessionRewards';

function rewards(overrides: Partial<RewardsSummary> = {}): RewardsSummary {
  return {
    xpGained: 412,
    breakdown: { correct: 340, correctWithHint: 15, sessionCompleted: 30, stageReached: 30 },
    dailyXp: 412,
    goal: 300,
    goalReached: true,
    streakDays: 13,
    bestStreak: 21,
    level: 7,
    xpToNext: 120,
    levelUps: [],
    unlocks: [],
    ...overrides,
  };
}

describe('RewardsPanel', () => {
  it('shows the points earned, with a detail by reason folded away', async () => {
    render(RewardsPanel, { rewards: rewards() });

    expect(screen.getByText('+412 XP')).toBeVisible();
    const detail = screen.getByText('Détail des XP');
    expect(screen.getByText('Réponses justes : 340 XP')).not.toBeVisible();

    await userEvent.click(detail);

    expect(screen.getByText('Réponses justes : 340 XP')).toBeVisible();
    expect(screen.getByText('Fin de séance : 30 XP')).toBeVisible();
    expect(screen.getByText('Plantes qui ont grandi : 30 XP')).toBeVisible();
  });

  it('shows the daily goal in words and as a bar, and says it is reached', () => {
    render(RewardsPanel, { rewards: rewards() });

    expect(screen.getByText('Objectif du jour : 412 / 300 XP')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Objectif du jour' })).toHaveAttribute(
      'aria-valuenow',
      '412',
    );
    expect(
      screen.getByText(
        'Objectif atteint. Les XP comptent moitié moins, ta mémoire, elle, en profite toujours.',
      ),
    ).toBeVisible();
  });

  it('says nothing of the goal reached while it is not', () => {
    render(RewardsPanel, { rewards: rewards({ dailyXp: 120, goalReached: false }) });

    expect(screen.getByText('Objectif du jour : 120 / 300 XP')).toBeVisible();
    expect(screen.queryByText(/Objectif atteint/)).toBeNull();
  });

  it('shows the streak and its record, and the level with the points left', () => {
    render(RewardsPanel, { rewards: rewards() });

    expect(screen.getByText('Série : 13 jours (record : 21)')).toBeVisible();
    expect(screen.getByText('Île niveau 7')).toBeVisible();
    expect(screen.getByText('Encore 120 XP pour le niveau 8')).toBeVisible();
  });

  it('uses the singular for a one-day streak', () => {
    render(RewardsPanel, { rewards: rewards({ streakDays: 1, bestStreak: 1 }) });

    expect(screen.getByText('Série : 1 jour (record : 1)')).toBeVisible();
  });

  it('celebrates a level up with the decorations it unlocks', () => {
    render(RewardsPanel, {
      rewards: rewards({ level: 10, levelUps: [10], unlocks: ['pavilion', 'paletteWinter'] }),
    });

    expect(screen.getByText('Niveau 10 atteint')).toBeVisible();
    expect(screen.getByText('Débloqué : Pavillon, Palette « hiver »')).toBeVisible();
  });

  it('offers to water the words still thirsty, as a secondary choice', async () => {
    const onContinue = vi.fn();
    render(RewardsPanel, { rewards: rewards(), thirstyLeft: 12, onContinue });

    await userEvent.click(
      screen.getByRole('button', { name: 'Encore 12 mots ont soif (≈ 4 min). Continuer' }),
    );

    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('offers nothing more when no word is thirsty', () => {
    render(RewardsPanel, { rewards: rewards(), thirstyLeft: 0, onContinue: vi.fn() });

    expect(screen.queryByRole('button')).toBeNull();
  });
});
