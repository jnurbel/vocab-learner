import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ToneCurve from './ToneCurve.svelte';

describe('ToneCurve', () => {
  it('draws one curve per tone, described in words for screen readers', () => {
    const { container } = render(ToneCurve, { tones: [2, 1], variant: 'heard' });

    expect(screen.getByRole('img', { name: 'Tons : 2e ton puis 1er ton' })).toBeVisible();
    const curves = [...container.querySelectorAll('path.curve')].map((path) =>
      path.getAttribute('d'),
    );
    expect(curves).toEqual(['M12 26 L76 6', 'M12 6 L76 6']);
  });

  it('names the neutral tone, and colours the curves of a wrong choice apart', () => {
    const { container } = render(ToneCurve, { tones: ['neutral'], variant: 'chosen' });

    expect(screen.getByRole('img', { name: 'Tons : ton neutre' })).toBeVisible();
    expect(container.querySelector('.tone-curve.chosen')).not.toBeNull();
  });
});
