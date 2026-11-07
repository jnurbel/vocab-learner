<script lang="ts">
  import type { Stage } from '../../domain/srs/reviewState';

  interface Props {
    stage: Stage;
    wilted: boolean;
  }

  const { stage, wilted }: Props = $props();
</script>

<!-- Decorative: the word and its stage are written next to the drawing. -->
<svg
  class="plant stage-{stage}"
  class:wilted
  viewBox="0 0 40 48"
  width="40"
  height="48"
  aria-hidden="true"
  focusable="false"
>
  <ellipse class="soil" cx="20" cy="44" rx="14" ry="3" />
  {#if stage === 'seed'}
    <ellipse class="seed" cx="20" cy="41" rx="4" ry="3" />
  {:else}
    <path class="stem" d="M20 43 V{stage === 'sprout' ? 34 : 18}" />
    <path class="leaf" d="M20 38 q-8 -2 -9 -8 q7 0 9 8" />
    <path class="leaf" d="M20 38 q8 -2 9 -8 q-7 0 -9 8" />
    {#if stage !== 'sprout'}
      <path class="leaf" d="M20 28 q-7 -2 -8 -7 q6 0 8 7" />
    {/if}
    {#if stage === 'bud'}
      <ellipse class="head" cx="20" cy="15" rx="4" ry="6" />
    {:else if stage === 'flower'}
      <circle class="head" cx="20" cy="14" r="7" />
      <circle class="heart" cx="20" cy="14" r="2.5" />
    {:else if stage === 'lantern'}
      <rect class="head" x="13" y="6" width="14" height="13" rx="4" />
      <path class="heart" d="M16 12.5 H24" />
    {/if}
  {/if}
</svg>

<style>
  .plant {
    display: block;
    overflow: visible;
    transform-origin: 50% 100%;
    transition: transform 600ms cubic-bezier(0.34, 1.3, 0.64, 1);
  }

  .soil {
    fill: var(--track);
  }

  .seed {
    fill: var(--plant-seed);
  }

  .stem {
    stroke: var(--jade);
    stroke-width: 3;
    stroke-linecap: round;
    fill: none;
  }

  .leaf {
    fill: var(--jade);
    transform-origin: 20px 38px;
  }

  .stage-sprout .leaf {
    fill: var(--plant-sprout);
  }

  .stage-bud .head {
    fill: var(--plant-bud);
  }

  .stage-flower .head {
    fill: var(--plant-flower);
  }

  .heart {
    fill: var(--plant-heart);
    stroke: var(--plant-heart);
    stroke-width: 2;
  }

  .stage-lantern .head {
    fill: var(--plant-lantern);
  }

  .stage-lantern .heart {
    stroke: var(--ochre);
  }

  /* Wilted: drooping leaves and duller colours, never dead (GAME_DESIGN.md 3.2). */
  .wilted {
    filter: saturate(0.45);
  }

  .wilted .leaf {
    transform: rotate(25deg) translateY(2px);
  }

  @media (prefers-reduced-motion: reduce) {
    .plant {
      transition: none;
    }
  }
</style>
