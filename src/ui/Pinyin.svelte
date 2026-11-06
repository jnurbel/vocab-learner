<script lang="ts">
  import { toneSegments } from '../domain/toneSyllables';
  import './tones.css';

  interface Props {
    pinyin: string;
  }

  const { pinyin }: Props = $props();

  const segments = $derived(toneSegments(pinyin));
</script>

<!-- The tone marks stay in the text: the colour is only a second cue. -->
<span class="pinyin"
  >{#each segments as segment, index (index)}{#if segment.tone === undefined}{segment.text}{:else}<span
        class="tone-{segment.tone}">{segment.text}</span
      >{/if}{/each}</span
>
