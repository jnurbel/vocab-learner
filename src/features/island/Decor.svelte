<script lang="ts">
  import type { DecorId } from '../../domain/game/island';

  interface Props {
    id: DecorId;
    /** The next decoration: a dotted outline only, to give an idea of what comes. */
    ghost?: boolean;
    /** The light halo under the dotted outline. */
    halo?: boolean;
    /** Just unlocked: it fades in once the island has grown. */
    fresh?: boolean;
  }

  const { id, ghost = false, halo = false, fresh = false }: Props = $props();
</script>

<!--
  Drawn around (0, 0), its foot on the ground; the island places it with a translation.
  Decorative: the island's text alternative and the lists below name every decoration.
-->
<g class="decor decor-{id}" class:ghost class:halo class:fresh aria-hidden="true" data-decor={id}>
  {#if id === 'pier'}
    <path class="wood" d="M-5 -2 L4 -2 L13 20 L4 20 Z" />
    <path class="plank" d="M-2 4 H7 M1 10 H10 M3 16 H12" />
  {:else if id === 'pathLamps'}
    {#each [-9, 9] as x (x)}
      <g transform="translate({x} {x > 0 ? 7 : -7})">
        <path class="post" d="M0 0 V-9" />
        <rect class="lamp" x="-2.5" y="-14" width="5" height="6" rx="2" />
      </g>
    {/each}
  {:else if id === 'stoneBenches'}
    {#each [-7, 7] as x (x)}
      <g transform="translate({x} 0)">
        <rect class="stone" x="-5" y="-4" width="10" height="2.5" rx="1" />
        <path class="leg" d="M-3.5 -1.5 V0 M3.5 -1.5 V0" />
      </g>
    {/each}
  {:else if id === 'pond'}
    <ellipse class="water rim" cx="0" cy="0" rx="14" ry="6.5" />
    <ellipse class="leaf" cx="5" cy="1" rx="2.5" ry="1.3" />
    <ellipse class="leaf" cx="-4" cy="-1.5" rx="2" ry="1" />
  {:else if id === 'kite'}
    <path class="kite" d="M0 -8 L6 0 L0 9 L-6 0 Z" />
    <path class="string" d="M-6 0 H6 M0 -8 V9" />
    <path class="string" d="M0 9 q-3 5 0 9 q3 4 0 8" />
  {:else if id === 'bamboo'}
    {#each [-4, 0, 4] as x, index (x)}
      <path class="stalk" d="M{x} 0 V{-18 - index * 4}" />
      <path class="leaf" d="M{x} {-12 - index * 3} q5 -1 6 -5 q-5 1 -6 5" />
    {/each}
  {:else if id === 'rowboat'}
    <path class="wood" d="M-12 -3 H12 Q9 4 0 4 Q-9 4 -12 -3 Z" />
    <path class="post" d="M-3 -3 L8 -10" />
  {:else if id === 'pavilion'}
    <rect class="stone" x="-12" y="-3" width="24" height="3" rx="1" />
    <path class="pillar" d="M-9 -3 V-14 M9 -3 V-14" />
    <path class="roof" d="M-15 -14 Q0 -24 15 -14 Q0 -17 -15 -14 Z" />
  {:else if id === 'archBridge'}
    <path class="arch" d="M-11 2 Q0 -10 11 2" />
    <path class="rail" d="M-10 -1 Q0 -13 10 -1" />
  {:else if id === 'beehives'}
    {#each [-6, 6] as x (x)}
      <g transform="translate({x} 0)">
        <path class="hive" d="M-4.5 0 V-5 Q0 -12 4.5 -5 V0 Z" />
        <path class="band" d="M-4.5 -4 H4.5" />
      </g>
    {/each}
  {:else if id === 'lighthouse'}
    <ellipse class="stone" cx="0" cy="0" rx="10" ry="4" />
    <path class="tower" d="M-4.5 -1 L-3 -26 H3 L4.5 -1 Z" />
    <path class="band-red" d="M-4 -10 H4 L3.8 -15 H-3.8 Z" />
    <circle class="lamp" cx="0" cy="-29" r="3" />
  {:else if id === 'pebbleGarden'}
    <ellipse class="sand" cx="0" cy="0" rx="15" ry="6" />
    <path class="rake" d="M-11 -1 Q0 -4 11 -1 M-11 2 Q0 -1 11 2" />
    <ellipse class="stone" cx="-4" cy="0" rx="3" ry="2" />
    <ellipse class="stone" cx="5" cy="-1" rx="2" ry="1.4" />
  {:else if id === 'observatory'}
    <rect class="tower" x="-7" y="-9" width="14" height="9" />
    <path class="dome" d="M-8 -9 A8 8 0 0 1 8 -9 Z" />
    <path class="slit" d="M0 -16 V-10" />
  {:else if id === 'greatTree'}
    <path class="trunk" d="M-2.5 0 L-1.5 -14 H1.5 L2.5 0 Z" />
    <circle class="leaf" cx="0" cy="-22" r="11" />
    <circle class="leaf" cx="-9" cy="-15" r="7" />
    <circle class="leaf" cx="9" cy="-16" r="7" />
  {:else if id === 'waterfall'}
    <path class="fall" d="M-4 -1 V13 M0 0 V15 M4 -1 V12" />
    <ellipse class="foam" cx="0" cy="16" rx="8" ry="2.5" />
  {:else}
    <!-- secondIslet -->
    <ellipse class="cliff" cx="0" cy="4" rx="26" ry="11" />
    <ellipse class="grass" cx="0" cy="0" rx="26" ry="11" />
    <path class="trunk" d="M-1 0 V-8 H1 V0 Z" />
    <circle class="leaf" cx="0" cy="-11" r="5" />
  {/if}
</g>

<style>
  .decor {
    fill: none;
    stroke: none;
    stroke-linecap: round;
  }

  .wood,
  .arch {
    fill: var(--island-wood);
  }

  .plank,
  .rail,
  .post,
  .leg {
    stroke: var(--island-wood);
    stroke-width: 1.4;
  }

  .plank {
    stroke: var(--island-cliff);
  }

  .arch {
    fill: none;
    stroke: var(--island-wood);
    stroke-width: 3.5;
  }

  .lamp {
    fill: var(--island-light);
    stroke: var(--island-roof);
    stroke-width: 0.8;
  }

  .stone,
  .pillar {
    fill: var(--island-stone);
  }

  .pillar {
    stroke: var(--island-wood);
    stroke-width: 2;
  }

  .water {
    fill: var(--water);
  }

  .rim {
    stroke: var(--island-foam);
    stroke-width: 1.2;
  }

  .leaf,
  .grass {
    fill: var(--leaf);
  }

  .grass {
    fill: var(--grass);
  }

  .cliff {
    fill: var(--island-cliff);
  }

  .stalk {
    stroke: var(--leaf);
    stroke-width: 2;
  }

  .kite {
    fill: var(--island-roof);
  }

  .string {
    stroke: var(--island-light);
    stroke-width: 0.8;
  }

  .roof,
  .band-red {
    fill: var(--island-roof);
  }

  .hive {
    fill: var(--island-light);
  }

  .band {
    stroke: var(--island-wood);
    stroke-width: 1;
  }

  .tower {
    fill: var(--island-foam);
    stroke: var(--island-stone);
    stroke-width: 0.8;
  }

  .dome {
    fill: var(--island-stone);
  }

  .slit {
    stroke: var(--island-cliff);
    stroke-width: 1.5;
  }

  .sand {
    fill: var(--island-path);
  }

  .rake {
    stroke: var(--island-stone);
    stroke-width: 0.6;
  }

  .trunk {
    fill: var(--island-wood);
  }

  .fall {
    stroke: var(--island-foam);
    stroke-width: 2.2;
  }

  .foam {
    fill: var(--island-foam);
  }

  /* The next decoration: an ink dotted outline on a light halo, readable on every palette. */
  .ghost * {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.2;
    stroke-dasharray: 2.5 2;
  }

  .ghost.halo * {
    stroke: var(--surface);
    stroke-width: 3.2;
    stroke-dasharray: none;
  }

  .fresh {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: decor-appear 400ms cubic-bezier(0.34, 1.3, 0.64, 1) 700ms both;
  }

  @keyframes decor-appear {
    from {
      opacity: 0;
      transform: scale(0.4);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fresh {
      animation: none;
    }
  }
</style>
