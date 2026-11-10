import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import fr from '../../i18n/fr.json';
import OfflineBadge from './OfflineBadge.svelte';

describe('OfflineBadge', () => {
  it('says "Hors ligne" without a network, and that the app works all the same', () => {
    render(OfflineBadge, { online: false });

    const badge = screen.getByText(fr.pwa.offline);
    expect(badge).toHaveAttribute('title', fr.pwa.offlineTitle);
    expect(screen.getByTestId('connectivity')).toContainElement(badge);
    expect(screen.getByTestId('connectivity')).toHaveAttribute('aria-live', 'polite');
  });

  it('stays quiet while online', () => {
    render(OfflineBadge, { online: true });

    expect(screen.getByTestId('connectivity')).toBeEmptyDOMElement();
  });
});
