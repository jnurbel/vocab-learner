import type { ProgressRecord } from '../progressRecords';
import type { EconomyConfig } from './economyConfig';

/**
 * The drawn island of the garden (DESIGN.md 5 bis: "each level grows the island").
 * Pure geometry: the island only represents the economy (levels, unlocks, fireflies),
 * it never changes it. Coordinates are SVG user units of a fixed view box.
 */

/** A position relative to the island: u = 1 is its right shore, v = 1 its bottom shore. */
export interface Slot {
  readonly u: number;
  readonly v: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Half-axes of the island ellipse, and how indented its coast is (0 = a plain ellipse). */
export interface IslandSize {
  readonly rx: number;
  readonly ry: number;
  readonly wobble: number;
}

/** The decorations drawn on the island, one per visible level unlock (GAME_DESIGN.md 4.5). */
export const DECOR_IDS = [
  'pier',
  'pathLamps',
  'stoneBenches',
  'pond',
  'kite',
  'bamboo',
  'rowboat',
  'pavilion',
  'archBridge',
  'beehives',
  'lighthouse',
  'pebbleGarden',
  'observatory',
  'greatTree',
  'waterfall',
  'secondIslet',
] as const;

export type DecorId = (typeof DECOR_IDS)[number];

/** The palette unlocks, from the first to the last; 'spring' is the island before any. */
export const PALETTE_UNLOCKS = {
  paletteAutumn: 'autumn',
  paletteWinter: 'winter',
  paletteNight: 'night',
  paletteDawn: 'dawn',
} as const;

export type IslandPalette = 'spring' | (typeof PALETTE_UNLOCKS)[keyof typeof PALETTE_UNLOCKS];

export interface IslandConfig {
  readonly viewBox: { readonly width: number; readonly height: number };
  /**
   * The picture shows this share of the view box around the first islet, and all of it at
   * maxLevel: small islands stay readable on a phone, and the growth stays visible.
   */
  readonly cameraMinScale: number;
  /** The decorations are drawn this much bigger than their drawing units. */
  readonly decorScale: number;
  readonly center: Point;
  /** The island stops growing at this level; the unlocks beyond it still come. */
  readonly maxLevel: number;
  readonly firstRadius: number;
  readonly lastRadius: number;
  /** ry / rx: the island is seen from above at a slant. */
  readonly aspect: number;
  readonly firstWobble: number;
  readonly lastWobble: number;
  readonly outlinePoints: number;
  /** Parcels: two at first (Chinese and English), one more every `parcelEvery` levels. */
  readonly firstParcels: number;
  readonly parcelEvery: number;
  readonly parcelSlots: readonly Slot[];
  /** The level that brings the stream, a level without any unlock of its own. */
  readonly streamFromLevel: number;
  /** From its spring down to the sea, through the pond. */
  readonly streamSlots: readonly Slot[];
  /** The path from the middle of the island down to the pier. */
  readonly pathSlots: readonly Slot[];
  readonly decorSlots: Readonly<Record<DecorId, Slot>>;
  readonly fireflySlots: readonly Slot[];
  readonly lanternSlots: readonly Slot[];
  /** Duration of the growth after a level up (GAME_DESIGN.md 7.1, about 800 ms). */
  readonly growthMs: number;
}

const slot = (u: number, v: number): Slot => Object.freeze({ u, v });

export const ISLAND_CONFIG: IslandConfig = Object.freeze({
  viewBox: Object.freeze({ width: 520, height: 310 }),
  cameraMinScale: 0.6,
  decorScale: 1.3,
  center: Object.freeze({ x: 250, y: 160 }),
  maxLevel: 20,
  firstRadius: 50,
  lastRadius: 200,
  aspect: 0.5,
  firstWobble: 0.03,
  lastWobble: 0.09,
  outlinePoints: 24,
  firstParcels: 2,
  parcelEvery: 4,
  parcelSlots: Object.freeze([
    slot(-0.38, 0.02),
    slot(0.38, 0.02),
    slot(0, -0.52),
    slot(0.58, -0.5),
    slot(-0.36, -0.62),
    slot(-0.1, -0.8),
  ]),
  streamFromLevel: 11,
  streamSlots: Object.freeze([
    slot(-0.5, -0.82),
    slot(-0.68, -0.3),
    slot(-0.62, 0.25),
    slot(-0.72, 0.64),
  ]),
  pathSlots: Object.freeze([slot(0.04, 0.14), slot(0.2, 0.5), slot(0.5, 0.84)]),
  decorSlots: Object.freeze({
    pier: slot(0.52, 0.86),
    pathLamps: slot(0.2, 0.5),
    stoneBenches: slot(-0.2, 0.5),
    pond: slot(-0.68, -0.3),
    kite: slot(-0.35, -1.3),
    bamboo: slot(0.8, -0.1),
    rowboat: slot(-0.4, 1.2),
    pavilion: slot(0.3, -0.7),
    archBridge: slot(-0.62, 0.25),
    beehives: slot(0.8, 0.22),
    lighthouse: slot(1.1, -0.42),
    pebbleGarden: slot(0.15, -0.18),
    observatory: slot(0.58, 0.55),
    greatTree: slot(-0.16, -0.22),
    waterfall: slot(-0.72, 0.64),
    secondIslet: slot(1.18, 0.86),
  }),
  fireflySlots: Object.freeze([
    slot(-0.55, -0.5),
    slot(0.2, -0.88),
    slot(0.45, -0.2),
    slot(-0.08, 0.32),
    slot(0.72, 0.02),
    slot(-0.82, 0.18),
    slot(0.3, 0.36),
    slot(-0.3, -0.32),
    slot(0.9, -0.42),
    slot(-0.55, 0.72),
    slot(0.05, -1.05),
    slot(0.62, 0.82),
  ]),
  lanternSlots: Object.freeze([
    slot(-1.1, 0.3),
    slot(-0.88, 0.94),
    slot(0.1, 1.16),
    slot(0.86, 1.04),
    slot(-1.08, -0.5),
    slot(1.12, 0.36),
    slot(0.62, -1.12),
    slot(1.1, 0.02),
  ]),
  growthMs: 800,
});

type UnlockTable = Pick<EconomyConfig, 'levelUnlocks'>;

export interface IslandShape {
  /** The level as drawn: capped at maxLevel. */
  level: number;
  size: IslandSize;
  outline: Point[];
  parcels: number;
  stream: boolean;
  /** The arch bridge crosses the stream once both are there. */
  bridge: boolean;
}

/** One decoration on the island, at its fixed slot. */
export interface PlacedDecor {
  id: DecorId;
  /** The level that unlocks it. */
  level: number;
  slot: Slot;
}

export interface IslandAchievements {
  /** One for 10 words in flower (EconomyConfig.firefliesPerFlowers). */
  fireflies: number;
  /** One for 5 words at the lantern stage (EconomyConfig.floatingLanternPerLanterns). */
  floatingLanterns: number;
}

export interface IslandScene {
  shape: IslandShape;
  palette: IslandPalette;
  /** The decorations unlocked so far, in the order of the levels. */
  decors: PlacedDecor[];
  /** The next decoration, drawn as a dotted outline; none after the last one. */
  next: PlacedDecor | undefined;
  /** Where the fireflies and the floating lanterns are drawn: capped, whatever the counts. */
  fireflySlots: Slot[];
  lanternSlots: Slot[];
}

const isDecorId = (id: string): id is DecorId => (DECOR_IDS as readonly string[]).includes(id);
const round = (value: number) => Math.round(value * 10) / 10;

function cappedLevel(level: number, config: IslandConfig): number {
  return Math.min(Math.max(1, Math.floor(level)), config.maxLevel);
}

/** The size of the island at a level: it grows by an even step up to maxLevel. */
export function islandSize(level: number, config: IslandConfig = ISLAND_CONFIG): IslandSize {
  const progress = (cappedLevel(level, config) - 1) / (config.maxLevel - 1);
  const rx = config.firstRadius + (config.lastRadius - config.firstRadius) * progress;
  return {
    rx,
    ry: rx * config.aspect,
    wobble: config.firstWobble + (config.lastWobble - config.firstWobble) * progress,
  };
}

export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part of the view box shown for an island of this size, centred on the island. */
export function islandCamera(size: IslandSize, config: IslandConfig = ISLAND_CONFIG): Camera {
  const { viewBox, center, cameraMinScale, firstRadius, lastRadius } = config;
  const progress = Math.min(Math.max((size.rx - firstRadius) / (lastRadius - firstRadius), 0), 1);
  const scale = cameraMinScale + (1 - cameraMinScale) * progress;
  const width = viewBox.width * scale;
  const height = viewBox.height * scale;
  const x = Math.min(Math.max(center.x - width / 2, 0), viewBox.width - width);
  const y = Math.min(Math.max(center.y - height / 2, 0), viewBox.height - height);
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

/** A size between two others, for the growth animation (t from 0 to 1). */
export function interpolateSize(from: IslandSize, to: IslandSize, t: number): IslandSize {
  const mix = (a: number, b: number) => a + (b - a) * Math.min(Math.max(t, 0), 1);
  return {
    rx: mix(from.rx, to.rx),
    ry: mix(from.ry, to.ry),
    wobble: mix(from.wobble, to.wobble),
  };
}

/** The coast: a fixed wave around the ellipse, so that the same size gives the same island. */
function coastFactor(angle: number, wobble: number): number {
  return 1 + wobble * (0.6 * Math.sin(3 * angle + 0.8) + 0.4 * Math.sin(5 * angle + 2.1));
}

export function islandOutline(size: IslandSize, config: IslandConfig = ISLAND_CONFIG): Point[] {
  const { center, outlinePoints } = config;
  return Array.from({ length: outlinePoints }, (_, index) => {
    const angle = (2 * Math.PI * index) / outlinePoints;
    const factor = coastFactor(angle, size.wobble);
    return {
      x: round(center.x + size.rx * factor * Math.cos(angle)),
      y: round(center.y + size.ry * factor * Math.sin(angle)),
    };
  });
}

/** Where a slot is on an island of this size. */
export function placeSlot(
  { u, v }: Slot,
  size: IslandSize,
  config: IslandConfig = ISLAND_CONFIG,
): Point {
  return { x: round(config.center.x + u * size.rx), y: round(config.center.y + v * size.ry) };
}

/** A smooth closed SVG path through the points (Catmull-Rom turned into Bézier curves). */
export function smoothClosedPath(points: readonly Point[]): string {
  const at = (index: number) => pointAt(points, (index + points.length) % points.length);
  const [first] = points;
  if (first === undefined) {
    return '';
  }
  const curves = points.map((_, index) => {
    const [previous, start, end, after] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    const c1 = { x: start.x + (end.x - previous.x) / 6, y: start.y + (end.y - previous.y) / 6 };
    const c2 = { x: end.x - (after.x - start.x) / 6, y: end.y - (after.y - start.y) / 6 };
    return `C${pair(c1)} ${pair(c2)} ${pair(end)}`;
  });
  return `M${pair(first)} ${curves.join(' ')}Z`;
}

/** A smooth open SVG path through the points, such as the stream or the path. */
export function smoothOpenPath(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) {
    return '';
  }
  const at = (index: number) => pointAt(points, Math.min(Math.max(index, 0), points.length - 1));
  const curves = rest.map((end, index) => {
    const [previous, start, after] = [at(index - 1), at(index), at(index + 2)];
    const c1 = { x: start.x + (end.x - previous.x) / 6, y: start.y + (end.y - previous.y) / 6 };
    const c2 = { x: end.x - (after.x - start.x) / 6, y: end.y - (after.y - start.y) / 6 };
    return `C${pair(c1)} ${pair(c2)} ${pair(end)}`;
  });
  return [`M${pair(first)}`, ...curves].join(' ');
}

/** The point at an index known to exist. */
export function pointAt(points: readonly Point[], index: number): Point {
  const point = points[index];
  if (point === undefined) {
    throw new RangeError(`No point at index ${String(index)}`);
  }
  return point;
}

function pair({ x, y }: Point): string {
  return `${String(round(x))} ${String(round(y))}`;
}

function unlockLevel(id: string, economy: UnlockTable): number | undefined {
  return economy.levelUnlocks.find(({ ids }) => ids.includes(id))?.level;
}

/** The island of a level: always the same for the same level, capped at maxLevel. */
export function islandShape(
  level: number,
  economy: UnlockTable,
  config: IslandConfig = ISLAND_CONFIG,
): IslandShape {
  const drawn = cappedLevel(level, config);
  const size = islandSize(drawn, config);
  const extraParcels = Math.floor((drawn - 1) / config.parcelEvery);
  const stream = drawn >= config.streamFromLevel;
  const bridgeLevel = unlockLevel('archBridge', economy);
  return {
    level: drawn,
    size,
    outline: islandOutline(size, config),
    parcels: Math.min(config.firstParcels + extraParcels, config.parcelSlots.length),
    stream,
    bridge: stream && bridgeLevel !== undefined && level >= bridgeLevel,
  };
}

/** The decorations of the unlock table, in order, each at its slot. */
export function islandDecors(economy: UnlockTable, config: IslandConfig = ISLAND_CONFIG) {
  return economy.levelUnlocks.flatMap(({ level, ids }) =>
    ids.filter(isDecorId).map((id): PlacedDecor => ({ id, level, slot: config.decorSlots[id] })),
  );
}

/** The last palette unlocked at this level; the island keeps its spring colours before. */
export function islandPalette(level: number, economy: UnlockTable): IslandPalette {
  const palettes = economy.levelUnlocks
    .filter((unlock) => unlock.level <= level)
    .flatMap(({ ids }) => ids)
    .flatMap((id) => (id in PALETTE_UNLOCKS ? [id as keyof typeof PALETTE_UNLOCKS] : []));
  const last = palettes.at(-1);
  return last === undefined ? 'spring' : PALETTE_UNLOCKS[last];
}

/** Everything the island shows at a level, with the counts of the achievements. */
export function islandScene(
  level: number,
  { fireflies, floatingLanterns }: IslandAchievements,
  economy: UnlockTable,
  config: IslandConfig = ISLAND_CONFIG,
): IslandScene {
  const all = islandDecors(economy, config);
  return {
    shape: islandShape(level, economy, config),
    palette: islandPalette(level, economy),
    decors: all.filter((decor) => decor.level <= level),
    next: all.find((decor) => decor.level > level),
    fireflySlots: config.fireflySlots.slice(0, Math.max(0, fireflies)),
    lanternSlots: config.lanternSlots.slice(0, Math.max(0, floatingLanterns)),
  };
}

/** The decorations that appeared between two levels: they fade in after a level up. */
export function freshDecors(from: number, to: number, economy: UnlockTable): DecorId[] {
  return islandDecors(economy)
    .filter(({ level }) => level > from && level <= to)
    .map(({ id }) => id);
}

/**
 * The level the island grows from when the garden opens: the last level seen there. A
 * garden never opened since the island exists grows from the small islet of level 1.
 */
export function islandGrowthStart(progress: ProgressRecord | undefined, level: number): number {
  return Math.min(progress?.islandLevelSeen ?? 1, level);
}

/** Remembers that the island of this level was seen; the level seen never goes down. */
export function markIslandSeen(progress: ProgressRecord, level: number): ProgressRecord {
  return { ...progress, islandLevelSeen: Math.max(progress.islandLevelSeen ?? 0, level) };
}
