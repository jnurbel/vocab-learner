import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { StudyOutlookView } from './flashcardSession';
import StudyOutlookPanel from './StudyOutlookPanel.svelte';

function outlook(overrides: Partial<StudyOutlookView> = {}): StudyOutlookView {
  return {
    today: '2026-11-06',
    newPerDay: 5,
    dueToday: 6,
    reviewedToday: 0,
    dueTomorrow: 0,
    newAvailableToday: 4,
    newWaiting: 0,
    ...overrides,
  };
}

describe('StudyOutlookPanel', () => {
  it("tells today's reviews and new words, and the new words waiting beyond the quota", () => {
    render(StudyOutlookPanel, { outlook: outlook({ newWaiting: 15 }) });

    expect(screen.getByText("Aujourd'hui : 6 à revoir, 4 nouveaux")).toBeVisible();
    expect(screen.getByText('15 mots nouveaux attendent (5 par jour)')).toBeVisible();
  });

  it('uses the singular for one word, and says nothing of waiting words when there are none', () => {
    render(StudyOutlookPanel, { outlook: outlook({ dueToday: 0, newAvailableToday: 1 }) });

    expect(screen.getByText("Aujourd'hui : 0 à revoir, 1 nouveau")).toBeVisible();
    expect(screen.queryByText(/attend/)).toBeNull();
  });

  it('tells when the next reviews come, tomorrow or on a later day', () => {
    const { unmount } = render(StudyOutlookPanel, {
      outlook: outlook({ dueToday: 0, nextReview: { day: '2026-11-07', count: 12 } }),
    });
    expect(screen.getByText('Prochaine révision : demain, 12 mots')).toBeVisible();
    unmount();

    render(StudyOutlookPanel, {
      outlook: outlook({ dueToday: 0, nextReview: { day: '2026-11-12', count: 1 } }),
    });
    expect(screen.getByText('Prochaine révision : jeudi 12 novembre, 1 mot')).toBeVisible();
  });

  it('tells how many words were already reviewed today, and announces changes politely', () => {
    render(StudyOutlookPanel, { outlook: outlook({ reviewedToday: 3 }) });

    expect(
      screen.getByText("3 mots déjà revus aujourd'hui : ils reviendront plus tard"),
    ).toBeVisible();
    expect(screen.getByText(/^Aujourd'hui/).closest('[aria-live="polite"]')).not.toBeNull();
  });
});
