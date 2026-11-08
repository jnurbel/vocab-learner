<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { ECONOMY_CONFIG } from '../../domain/game/economyConfig';
  import {
    freshDecors,
    interpolateSize,
    ISLAND_CONFIG,
    islandCamera,
    islandOutline,
    islandScene,
    islandSize,
    placeSlot,
    smoothClosedPath,
    smoothOpenPath,
    type Point,
    type Slot,
  } from '../../domain/game/island';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import Decor from './Decor.svelte';
  import { islandLabel } from './islandText';

  interface Props {
    level: number;
    /** The level of the island last seen: it grows from there to `level` (GAME_DESIGN.md 7.3). */
    fromLevel?: number;
    fireflies?: number;
    floatingLanterns?: number;
  }

  const { level, fromLevel, fireflies = 0, floatingLanterns = 0 }: Props = $props();

  const { viewBox } = ISLAND_CONFIG;
  /** The kite's string is tied there, on the island. */
  const KITE_TETHER: Slot = { u: -0.25, v: -0.5 };
  /** A few ripples around the island, which follow its shore. */
  const WAVES: readonly Slot[] = [
    { u: -1.05, v: -0.95 },
    { u: 0.92, v: -0.95 },
    { u: -0.8, v: 1.25 },
    { u: 0.35, v: 1.3 },
  ];
  const PARCEL = { width: 24, height: 13 };
  const TAG = { width: 50, height: 15, rise: 40 };
  /** The tag keeps the same size on screen while the camera zooms out. */
  const TAG_SCALE_WIDTH = 400;

  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Read once, when the garden opens: the growth is played a single time, then the end stays.
  const start = untrack(() => Math.min(fromLevel ?? level, level));
  const grown = untrack(() => start < level);
  const fresh = new Set(untrack(() => freshDecors(start, level, ECONOMY_CONFIG)));
  const startSize = islandSize(start);
  /** From 0 (the island last seen) to 1 (the island of today). */
  let growth = $state(grown && !reducedMotion ? 0 : 1);

  onMount(() => {
    if (growth === 1) {
      return undefined;
    }
    const begin = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const elapsed = Math.min((now - begin) / ISLAND_CONFIG.growthMs, 1);
      growth = cubicOut(elapsed);
      if (elapsed < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  });

  const achievements = $derived({ fireflies, floatingLanterns });
  const scene = $derived(islandScene(level, achievements, ECONOMY_CONFIG));
  const size = $derived(interpolateSize(startSize, scene.shape.size, growth));
  const coast = $derived(smoothClosedPath(islandOutline(size)));
  const camera = $derived(islandCamera(size));
  const frame = $derived(
    [camera.x, camera.y, camera.width, camera.height].map((value) => String(value)).join(' '),
  );
  const at = (slot: Slot): Point => placeSlot(slot, size);
  const path = $derived(smoothOpenPath(ISLAND_CONFIG.pathSlots.map(at)));
  const stream = $derived(smoothOpenPath(ISLAND_CONFIG.streamSlots.map(at)));
  const parcels = $derived(ISLAND_CONFIG.parcelSlots.slice(0, scene.shape.parcels).map(at));
  // Drawn from the back to the front; the kite flies above everything.
  const grounded = $derived(
    scene.decors.filter(({ id }) => id !== 'kite').toSorted((a, b) => a.slot.v - b.slot.v),
  );
  const kite = $derived(scene.decors.find(({ id }) => id === 'kite'));
  const label = $derived(islandLabel(level, scene, achievements));

  const translate = ({ x, y }: Point) => `translate(${String(x)} ${String(y)})`;
  const place = (point: Point) => `${translate(point)} scale(${String(ISLAND_CONFIG.decorScale)})`;
  const tagScale = $derived(camera.width / TAG_SCALE_WIDTH);
  /** The tag of the next decoration, kept inside the picture. */
  function tagAt({ x, y }: Point): Point {
    const half = (TAG.width / 2) * tagScale;
    return {
      x: Math.min(Math.max(x, camera.x + half + 4), camera.x + camera.width - half - 4),
      y: Math.max(y - TAG.rise, camera.y + (TAG.height / 2) * tagScale + 4),
    };
  }
</script>

<figure class="island-figure">
  <svg
    class="island palette-{scene.palette}"
    viewBox={frame}
    role="img"
    aria-label={label}
    focusable="false"
    data-level={scene.shape.level}
  >
    <g aria-hidden="true">
      <rect class="sea" width={viewBox.width} height={viewBox.height} />
      {#each WAVES as slot, index (index)}
        {@const point = at(slot)}
        <path class="wave" d="M{point.x - 10} {point.y} q5 -4 10 0 t10 0" />
      {/each}

      {#each scene.lanternSlots as slot, index (index)}
        {@const point = at(slot)}
        <g class="floating-lantern" transform={translate(point)}>
          <ellipse class="glow" cx="0" cy="4" rx="8" ry="2.5" />
          <rect class="lantern" x="-4" y="-8" width="8" height="9" rx="3" />
        </g>
      {/each}

      <g transform="translate(0 9)">
        <path class="cliff" d={coast} />
      </g>
      <path class="shore" d={coast} />
      <path class="land" d={coast} data-testid="island-land" />
      <path class="path" d={path} />
      {#if scene.shape.stream}
        <path class="bank" d={stream} />
        <path class="stream" d={stream} data-testid="island-stream" />
      {/if}

      {#each parcels as point, index (index)}
        <g class="parcel" transform={translate(point)}>
          <rect
            x={-PARCEL.width / 2}
            y={-PARCEL.height / 2}
            width={PARCEL.width}
            height={PARCEL.height}
            rx="4"
          />
          <circle class="bloom" cx="-6" cy="0" r="2.2" />
          <circle class="bud" cx="0" cy="0" r="2" />
          <circle class="sprout" cx="6" cy="0" r="2" />
        </g>
      {/each}

      {#each grounded as decor (decor.id)}
        <g transform={place(at(decor.slot))}>
          <Decor id={decor.id} fresh={fresh.has(decor.id)} />
        </g>
      {/each}

      {#if kite !== undefined}
        {@const point = at(kite.slot)}
        {@const tether = at(KITE_TETHER)}
        <path
          class="kite-string"
          d="M{point.x} {point.y + 9} Q{point.x + 14} {(point.y + tether.y) /
            2} {tether.x} {tether.y}"
        />
        <g transform={place(point)}>
          <Decor id="kite" fresh={fresh.has('kite')} />
        </g>
      {/if}

      {#each scene.fireflySlots as slot, index (index)}
        {@const point = at(slot)}
        <g class="firefly" transform={translate(point)}>
          <circle class="halo" r="6" />
          <circle class="spark" r="2.6" />
        </g>
      {/each}

      {#if scene.next !== undefined}
        {@const point = at(scene.next.slot)}
        {@const tag = tagAt(point)}
        <g class="next" data-testid="island-next">
          <g transform={place(point)}>
            <Decor id={scene.next.id} ghost halo />
            <Decor id={scene.next.id} ghost />
          </g>
          <g class="tag" transform="{translate(tag)} scale({tagScale})">
            <rect
              x={-TAG.width / 2}
              y={-TAG.height / 2}
              width={TAG.width}
              height={TAG.height}
              rx="7.5"
            />
            <text x="0" y="3.5">{format(fr.island.nextTag, { level: scene.next.level })}</text>
          </g>
        </g>
      {/if}
    </g>
  </svg>
  {#if grown}
    <figcaption class="grew">{format(fr.island.grew, { from: start, to: level })}</figcaption>
  {/if}
</figure>

<style>
  .island-figure {
    margin: 0;
  }

  .island {
    display: block;
    width: 100%;
    max-width: 46rem;
    height: auto;
    margin-inline: auto;
    overflow: hidden;
    border-radius: var(--radius-card);

    --water: var(--island-water);
    --grass: var(--island-grass);
    --parcel: var(--island-parcel);
    --leaf: var(--island-leaf);
  }

  .palette-autumn {
    --water: var(--island-autumn-water);
    --grass: var(--island-autumn-grass);
    --parcel: var(--island-autumn-parcel);
    --leaf: var(--island-autumn-leaf);
  }

  .palette-winter {
    --water: var(--island-winter-water);
    --grass: var(--island-winter-grass);
    --parcel: var(--island-winter-parcel);
    --leaf: var(--island-winter-leaf);
  }

  .palette-night {
    --water: var(--island-night-water);
    --grass: var(--island-night-grass);
    --parcel: var(--island-night-parcel);
    --leaf: var(--island-night-leaf);
  }

  .palette-dawn {
    --water: var(--island-dawn-water);
    --grass: var(--island-dawn-grass);
    --parcel: var(--island-dawn-parcel);
    --leaf: var(--island-dawn-leaf);
  }

  .sea {
    fill: var(--water);
  }

  .wave {
    fill: none;
    stroke: var(--island-foam);
    stroke-width: 1.2;
    stroke-linecap: round;
    opacity: 0.7;
  }

  .cliff {
    fill: var(--island-cliff);
  }

  .shore {
    fill: none;
    stroke: var(--island-foam);
    stroke-width: 5;
    opacity: 0.6;
  }

  .land {
    fill: var(--grass);
  }

  .path {
    fill: none;
    stroke: var(--island-path);
    stroke-width: 4;
    stroke-linecap: round;
  }

  .bank {
    fill: none;
    stroke: var(--island-cliff);
    stroke-width: 9;
    stroke-linecap: round;
    opacity: 0.45;
  }

  .stream {
    fill: none;
    stroke: var(--water);
    stroke-width: 6;
    stroke-linecap: round;
  }

  .parcel rect {
    fill: var(--parcel);
    stroke: var(--island-cliff);
    stroke-width: 1;
  }

  .bloom {
    fill: var(--plant-flower);
  }

  .bud {
    fill: var(--plant-bud);
  }

  .sprout {
    fill: var(--plant-sprout);
  }

  .kite-string {
    fill: none;
    stroke: var(--island-light);
    stroke-width: 0.8;
  }

  .lantern {
    fill: var(--island-light);
    stroke: var(--island-roof);
    stroke-width: 0.8;
  }

  .glow {
    fill: var(--island-light);
    opacity: 0.4;
  }

  .firefly .halo {
    fill: var(--island-light);
    opacity: 0.35;
  }

  .firefly .spark {
    fill: var(--island-light);
  }

  .firefly {
    animation: twinkle 3.2s ease-in-out infinite alternate;
  }

  .firefly:nth-of-type(3n + 1) {
    animation-delay: -1.1s;
  }

  .firefly:nth-of-type(3n + 2) {
    animation-delay: -2.3s;
  }

  @keyframes twinkle {
    from {
      opacity: 1;
    }

    to {
      opacity: 0.45;
    }
  }

  .tag rect {
    fill: var(--surface);
    stroke: var(--ink);
    stroke-width: 0.8;
    stroke-dasharray: 2.5 2;
  }

  .tag text {
    fill: var(--ink);
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: var(--weight-bold);
    text-anchor: middle;
  }

  .grew {
    margin-top: var(--space-2);
    color: var(--jade);
    font-weight: var(--weight-bold);
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .firefly {
      animation: none;
    }
  }
</style>
