import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  islandCamera,
  islandOutline,
  islandSize,
  smoothClosedPath,
} from '../../domain/game/island';
import Island from './Island.svelte';

const coastOf = (level: number) => smoothClosedPath(islandOutline(islandSize(level)));
const frameOf = (level: number) => {
  const { x, y, width, height } = islandCamera(islandSize(level));
  return `${String(x)} ${String(y)} ${String(width)} ${String(height)}`;
};

function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce'), media: query })),
  );
}

function island() {
  return screen.getByRole('img', { name: /^Île niveau/ });
}

function decorsOf(element: Element): string[] {
  return [...element.querySelectorAll('[data-decor]')].map(
    (decor) => decor.getAttribute('data-decor') ?? '',
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Island', () => {
  it('describes everything it draws, then what comes next', () => {
    render(Island, { level: 7, fireflies: 3 });

    expect(island()).toHaveAccessibleName(
      'Île niveau 7, palette automne : 3 parcelles, ponton, lampions, bancs de pierre, étang, ' +
        'cerf-volant, 3 lucioles. Prochain : bambous, niveau 8.',
    );
  });

  it('starts as a small islet with its two parcels, and announces the pier', () => {
    render(Island, { level: 1 });

    expect(island()).toHaveAccessibleName(
      'Île niveau 1 : 2 parcelles. Prochain : ponton, niveau 2.',
    );
    expect(island().querySelectorAll('.parcel')).toHaveLength(2);
  });

  it('draws the unlocked decorations only, and the next one as a dotted outline', () => {
    render(Island, { level: 3 });

    const next = screen.getByTestId('island-next');
    const unlocked = decorsOf(island()).filter((id) => !decorsOf(next).includes(id));
    expect(unlocked).toEqual(['pathLamps', 'pier']);
    // The outline is drawn twice: a light halo, then the dotted line.
    expect(decorsOf(next)).toEqual(['stoneBenches', 'stoneBenches']);
    expect(next).toHaveTextContent('niveau 4');
  });

  it('hides its decorations from assistive technologies', () => {
    render(Island, { level: 9 });

    for (const decor of island().querySelectorAll('[data-decor]')) {
      expect(decor).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('shows the stream and the bridge from level 12, and no outline after level 20', () => {
    render(Island, { level: 20, fireflies: 4, floatingLanterns: 2 });

    expect(screen.getByTestId('island-stream')).toBeInTheDocument();
    expect(decorsOf(island())).toContain('archBridge');
    expect(decorsOf(island())).toContain('secondIslet');
    expect(screen.queryByTestId('island-next')).not.toBeInTheDocument();
    expect(island()).toHaveAccessibleName(/ruisseau, .*4 lucioles, 2 lanternes flottantes\.$/);
  });

  it.each([
    [1, 'palette-spring'],
    [5, 'palette-autumn'],
    [10, 'palette-winter'],
    [15, 'palette-night'],
    [20, 'palette-dawn'],
  ])('takes the colours of the palette unlocked at level %i', (level, palette) => {
    render(Island, { level });

    expect(island()).toHaveClass(palette);
  });

  it('caps the fireflies and the floating lanterns it draws, and names their real counts', () => {
    render(Island, { level: 4, fireflies: 50, floatingLanterns: 30 });

    expect(island().querySelectorAll('.firefly')).toHaveLength(12);
    expect(island().querySelectorAll('.floating-lantern')).toHaveLength(8);
    expect(island()).toHaveAccessibleName(/50 lucioles, 30 lanternes flottantes/);
  });

  it('shows the final island at once when motion is reduced', () => {
    preferReducedMotion(true);
    render(Island, { level: 8, fromLevel: 2 });

    expect(screen.getByTestId('island-land')).toHaveAttribute('d', coastOf(8));
    expect(island()).toHaveAttribute('viewBox', frameOf(8));
    expect(screen.getByText(/niveau 2 → niveau 8/)).toBeVisible();
  });

  it('grows from the island last seen to the island of today', () => {
    preferReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const start = performance.now();
    render(Island, { level: 8, fromLevel: 2 });

    expect(screen.getByTestId('island-land')).toHaveAttribute('d', coastOf(2));
    expect(island().querySelector('[data-decor="bamboo"]')?.closest('.fresh')).not.toBeNull();
    frames.shift()?.(start + 400);
    expect(frames).toHaveLength(1);
    frames.shift()?.(start + 10_000);
    expect(frames).toHaveLength(0);
    return Promise.resolve().then(() => {
      expect(screen.getByTestId('island-land')).toHaveAttribute('d', coastOf(8));
    });
  });

  it('stops growing when the garden is closed during the growth', () => {
    preferReducedMotion(false);
    vi.stubGlobal('requestAnimationFrame', () => 7);
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const { unmount } = render(Island, { level: 5, fromLevel: 4 });

    unmount();

    expect(cancel).toHaveBeenCalledWith(7);
  });

  it('does not grow, nor say it grew, when the level was already seen', () => {
    render(Island, { level: 6, fromLevel: 6 });

    expect(screen.getByTestId('island-land')).toHaveAttribute('d', coastOf(6));
    expect(screen.queryByText(/a grandi/)).not.toBeInTheDocument();
  });
});
