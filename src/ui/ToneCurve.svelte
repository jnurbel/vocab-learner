<script lang="ts">
  import { contourPath } from '../domain/game/toneEcho';
  import type { Tone } from '../domain/toneSyllables';
  import { format } from '../i18n/format';
  import fr from '../i18n/fr.json';

  interface Props {
    tones: readonly Tone[];
    /** 'heard': the sound to learn, in jade; 'chosen': a wrong choice, in ochre. */
    variant: 'heard' | 'chosen';
  }

  const { tones, variant }: Props = $props();

  /** The size of the curves of docs/ui/mockups/ExToneEcho.dc.html. */
  const BOX = { width: 88, height: 52, margin: 6 };
  /** The five pitch levels, drawn as guide lines. */
  const GUIDES = 'M4 6H84M4 16H84M4 26H84M4 36H84M4 46H84';

  const label = $derived(
    format(fr.toneEcho.curveLabel, {
      tones: tones.map((tone) => fr.toneEcho.toneNames[tone]).join(fr.toneEcho.curveThen),
    }),
  );
</script>

<div class="tone-curve {variant}" role="img" aria-label={label}>
  {#each tones as tone, index (index)}
    <svg
      viewBox="0 0 {BOX.width} {BOX.height}"
      width={BOX.width}
      height={BOX.height}
      aria-hidden="true"
    >
      <path class="guides" d={GUIDES} />
      <path class="curve" d={contourPath(tone, BOX)} />
    </svg>
  {/each}
</div>

<style>
  .tone-curve {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    justify-content: center;
  }

  .guides {
    fill: none;
    stroke: var(--track);
    stroke-width: 1;
  }

  .curve {
    fill: none;
    stroke: var(--jade);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .chosen .curve {
    stroke: var(--ochre);
  }
</style>
