<script lang="ts">
  import type { Language } from '../domain/card';
  import fr from '../i18n/fr.json';

  interface Props {
    /** The language without a voice; only Chinese is often missing, e.g. on Android. */
    language: Language;
  }

  const { language }: Props = $props();
</script>

{#if language === 'zh'}
  <details class="voice-help">
    <summary>{fr.voice.missingHelpTitle}</summary>
    <p>{fr.voice.missingHelpAndroid}</p>
    <p>{fr.voice.missingHelpIos}</p>
  </details>
{/if}

<style>
  .voice-help {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
  }

  summary {
    cursor: pointer;
    font-weight: var(--weight-heavy);
  }
</style>
