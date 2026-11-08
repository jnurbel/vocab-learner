import { describe, expect, it } from 'vitest';
import { ECONOMY_CONFIG } from './economyConfig';
import {
  DECOR_IDS,
  freshDecors,
  interpolateSize,
  ISLAND_CONFIG,
  islandCamera,
  islandDecors,
  islandGrowthStart,
  islandOutline,
  islandPalette,
  islandScene,
  islandShape,
  islandSize,
  markIslandSeen,
  placeSlot,
  pointAt,
  smoothClosedPath,
  smoothOpenPath,
  type IslandSize,
  type Slot,
} from './island';

const NONE = { fireflies: 0, floatingLanterns: 0 };

/** True when the slot lies on dry land, with a margin for the indented coast. */
function onLand({ u, v }: Slot, size: IslandSize, margin = 0.85): boolean {
  return u * u + v * v <= (1 - size.wobble) ** 2 * margin;
}

describe('the shape of the island', () => {
  it('is a small islet at level 1, with the Chinese and the English parcels only', () => {
    const shape = islandShape(1, ECONOMY_CONFIG);

    expect(shape.size).toEqual({ rx: 50, ry: 25, wobble: 0.03 });
    expect(shape.parcels).toBe(2);
    expect(shape.stream).toBe(false);
    expect(shape.bridge).toBe(false);
  });

  it('grows at every level, by an even step', () => {
    const widths = Array.from({ length: 20 }, (_, index) => islandSize(index + 1).rx);
    const steps = widths.slice(1).map((width, index) => width - (widths[index] ?? 0));

    expect(new Set(steps.map((step) => step.toFixed(6)))).toHaveLength(1);
    expect(steps[0]).toBeGreaterThan(7);
  });

  it('stops growing beyond level 20', () => {
    expect(islandShape(20, ECONOMY_CONFIG).size).toEqual({ rx: 200, ry: 100, wobble: 0.09 });
    expect(islandShape(35, ECONOMY_CONFIG)).toEqual({
      ...islandShape(20, ECONOMY_CONFIG),
      level: 20,
    });
  });

  it('treats a level below 1 or a fraction as the level under it, at least 1', () => {
    expect(islandShape(0, ECONOMY_CONFIG).level).toBe(1);
    expect(islandShape(7.9, ECONOMY_CONFIG).level).toBe(7);
  });

  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [9, 4],
    [13, 5],
    [17, 6],
    [40, 6],
  ])('shows %i parcels at level %i', (level, parcels) => {
    expect(islandShape(level, ECONOMY_CONFIG).parcels).toBe(parcels);
  });

  it('brings the stream at level 11 and the arch bridge over it at level 12', () => {
    expect(islandShape(10, ECONOMY_CONFIG)).toMatchObject({ stream: false, bridge: false });
    expect(islandShape(11, ECONOMY_CONFIG)).toMatchObject({ stream: true, bridge: false });
    expect(islandShape(12, ECONOMY_CONFIG)).toMatchObject({ stream: true, bridge: true });
  });

  it('draws no bridge when the unlock table has none', () => {
    expect(islandShape(15, { levelUnlocks: [] }).bridge).toBe(false);
  });

  it('is deterministic: the same level always gives the same coast', () => {
    expect(islandShape(7, ECONOMY_CONFIG).outline).toEqual(islandShape(7, ECONOMY_CONFIG).outline);
    expect(islandShape(7, ECONOMY_CONFIG).outline).not.toEqual(
      islandShape(8, ECONOMY_CONFIG).outline,
    );
  });

  it('keeps a fixed number of outline points and stays inside the view box', () => {
    const { width, height } = ISLAND_CONFIG.viewBox;
    for (const level of [1, 10, 20]) {
      const { outline } = islandShape(level, ECONOMY_CONFIG);
      expect(outline).toHaveLength(ISLAND_CONFIG.outlinePoints);
      for (const { x, y } of outline) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(width);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(height);
      }
    }
  });

  it('draws the coast around the centre, a little indented', () => {
    const size = { rx: 100, ry: 50, wobble: 0 };
    const [east] = islandOutline(size);

    expect(east).toEqual({ x: 350, y: 160 });
  });
});

describe('the camera', () => {
  it('frames the first islet closely, and the whole view box at level 20', () => {
    expect(islandCamera(islandSize(1))).toEqual({ x: 94, y: 67, width: 312, height: 186 });
    expect(islandCamera(islandSize(20))).toEqual({ x: 0, y: 0, width: 520, height: 310 });
  });

  it('zooms out as the island grows, but less than the island grows', () => {
    const [small, big] = [islandCamera(islandSize(5)), islandCamera(islandSize(10))];
    const growth = islandSize(10).rx / islandSize(5).rx;

    expect(big.width).toBeGreaterThan(small.width);
    expect(big.width / small.width).toBeLessThan(growth);
  });

  it('shows every decoration, firefly and lantern of a level in the picture', () => {
    const margin = 12;
    for (let level = 1; level <= 20; level += 1) {
      const scene = islandScene(level, { fireflies: 50, floatingLanterns: 50 }, ECONOMY_CONFIG);
      const camera = islandCamera(scene.shape.size);
      const slots = [
        ...scene.decors.map(({ slot }) => slot),
        ...scene.fireflySlots,
        ...scene.lanternSlots,
      ];
      for (const slot of slots) {
        const { x, y } = placeSlot(slot, scene.shape.size);
        expect(x, `level ${String(level)}`).toBeGreaterThan(camera.x + margin);
        expect(x, `level ${String(level)}`).toBeLessThan(camera.x + camera.width - margin);
        expect(y, `level ${String(level)}`).toBeGreaterThan(camera.y + margin);
        expect(y, `level ${String(level)}`).toBeLessThan(camera.y + camera.height - margin);
      }
    }
  });

  it('stays inside the view box, whatever the size', () => {
    expect(islandCamera({ rx: 10, ry: 5, wobble: 0 })).toEqual(islandCamera(islandSize(1)));
    expect(islandCamera({ rx: 900, ry: 450, wobble: 0 })).toEqual(islandCamera(islandSize(20)));
  });
});

describe('the growth between two sizes', () => {
  const from = islandSize(1);
  const to = islandSize(2);

  it('starts at the old size and ends at the new one', () => {
    expect(interpolateSize(from, to, 0)).toEqual(from);
    expect(interpolateSize(from, to, 1)).toEqual(to);
  });

  it('is halfway at half the time, and never overshoots', () => {
    expect(interpolateSize(from, to, 0.5).rx).toBeCloseTo((from.rx + to.rx) / 2);
    expect(interpolateSize(from, to, 2)).toEqual(to);
    expect(interpolateSize(from, to, -1)).toEqual(from);
  });
});

describe('the SVG paths', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('closes a smooth path through every point', () => {
    const path = smoothClosedPath(square);

    expect(path.startsWith('M0 0 C')).toBe(true);
    expect(path.endsWith('0 0Z')).toBe(true);
    expect(path.match(/C/g)).toHaveLength(4);
  });

  it('opens a smooth path from the first point to the last', () => {
    const path = smoothOpenPath(square);

    expect(path.startsWith('M0 0 C')).toBe(true);
    expect(path.endsWith(' 0 10')).toBe(true);
    expect(path.match(/C/g)).toHaveLength(3);
  });

  it('draws nothing without points', () => {
    expect(smoothClosedPath([])).toBe('');
    expect(smoothOpenPath([])).toBe('');
  });

  it('refuses to read a point that does not exist', () => {
    expect(pointAt(square, 2)).toEqual({ x: 10, y: 10 });
    expect(() => pointAt(square, 4)).toThrow(RangeError);
  });

  it('places a slot relative to the size of the island', () => {
    expect(placeSlot({ u: 1, v: -1 }, { rx: 100, ry: 50, wobble: 0 })).toEqual({ x: 350, y: 110 });
  });
});

describe('the decorations', () => {
  it('gives every decoration of the unlock table a place, in the order of the levels', () => {
    const decors = islandDecors(ECONOMY_CONFIG);

    expect(decors.map(({ id }) => id)).toEqual([...DECOR_IDS]);
    expect(decors[0]).toEqual({ id: 'pier', level: 2, slot: ISLAND_CONFIG.decorSlots.pier });
  });

  it('puts the land decorations on dry land from the level that unlocks them', () => {
    const afloat = new Set(['pier', 'kite', 'rowboat', 'lighthouse', 'secondIslet', 'waterfall']);
    for (const { id, level, slot } of islandDecors(ECONOMY_CONFIG)) {
      if (!afloat.has(id)) {
        expect(onLand(slot, islandSize(level)), id).toBe(true);
      }
    }
  });

  it('puts the boats, the lighthouse and the islet out at sea', () => {
    for (const id of ['rowboat', 'lighthouse', 'secondIslet'] as const) {
      const { u, v } = ISLAND_CONFIG.decorSlots[id];
      expect(u * u + v * v, id).toBeGreaterThan(1);
    }
  });

  it('puts every parcel on dry land from the level that shows it', () => {
    ISLAND_CONFIG.parcelSlots.forEach((slot, index) => {
      const level = Math.max(1, (index - 1) * ISLAND_CONFIG.parcelEvery + 1);
      expect(onLand(slot, islandSize(level)), `parcel ${String(index)}`).toBe(true);
    });
  });

  it('shows the unlocked decorations only, and the next one as an outline', () => {
    const scene = islandScene(7, NONE, ECONOMY_CONFIG);

    expect(scene.decors.map(({ id }) => id)).toEqual([
      'pier',
      'pathLamps',
      'stoneBenches',
      'pond',
      'kite',
    ]);
    expect(scene.next).toMatchObject({ id: 'bamboo', level: 8 });
  });

  it('skips the palettes when it announces the next decoration', () => {
    expect(islandScene(4, NONE, ECONOMY_CONFIG).next).toMatchObject({ id: 'pond', level: 6 });
  });

  it('announces the pier on the first islet, and nothing after the last decoration', () => {
    const first = islandScene(1, NONE, ECONOMY_CONFIG);

    expect(first.decors).toEqual([]);
    expect(first.next).toMatchObject({ id: 'pier', level: 2 });
    expect(islandScene(20, NONE, ECONOMY_CONFIG).next).toBeUndefined();
  });

  it('lists the decorations that appeared between two levels', () => {
    expect(freshDecors(7, 10, ECONOMY_CONFIG)).toEqual(['bamboo', 'rowboat', 'pavilion']);
    expect(freshDecors(4, 5, ECONOMY_CONFIG)).toEqual([]);
  });
});

describe('the palette', () => {
  it.each([
    [1, 'spring'],
    [4, 'spring'],
    [5, 'autumn'],
    [10, 'winter'],
    [15, 'night'],
    [20, 'dawn'],
    [30, 'dawn'],
  ])('at level %i is %s', (level, palette) => {
    expect(islandPalette(level, ECONOMY_CONFIG)).toBe(palette);
    expect(islandScene(level, NONE, ECONOMY_CONFIG).palette).toBe(palette);
  });
});

describe('the fireflies and the floating lanterns', () => {
  it('draws one firefly per firefly earned and one lantern per floating lantern', () => {
    const scene = islandScene(3, { fireflies: 3, floatingLanterns: 1 }, ECONOMY_CONFIG);

    expect(scene.fireflySlots).toEqual(ISLAND_CONFIG.fireflySlots.slice(0, 3));
    expect(scene.lanternSlots).toEqual(ISLAND_CONFIG.lanternSlots.slice(0, 1));
  });

  it('caps what it draws, however many were earned', () => {
    const scene = islandScene(3, { fireflies: 50, floatingLanterns: 400 }, ECONOMY_CONFIG);

    expect(scene.fireflySlots).toHaveLength(12);
    expect(scene.lanternSlots).toHaveLength(8);
  });

  it('draws none for a count below zero', () => {
    const scene = islandScene(3, { fireflies: -1, floatingLanterns: -2 }, ECONOMY_CONFIG);

    expect(scene.fireflySlots).toEqual([]);
    expect(scene.lanternSlots).toEqual([]);
  });
});

describe('the level of the island last seen', () => {
  it('grows from the level last seen, or from the first islet when never seen', () => {
    expect(islandGrowthStart({ islandLevelSeen: 5 }, 8)).toBe(5);
    expect(islandGrowthStart({}, 8)).toBe(1);
    expect(islandGrowthStart(undefined, 1)).toBe(1);
  });

  it('never grows backwards, even when a restored backup is behind', () => {
    expect(islandGrowthStart({ islandLevelSeen: 9 }, 6)).toBe(6);
  });

  it('remembers the level seen, which never goes down', () => {
    expect(markIslandSeen({ xp: 1750 }, 8)).toEqual({ xp: 1750, islandLevelSeen: 8 });
    expect(markIslandSeen({ islandLevelSeen: 9 }, 6)).toEqual({ islandLevelSeen: 9 });
  });
});
