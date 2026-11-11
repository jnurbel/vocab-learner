<script lang="ts">
  import fr from '../../i18n/fr.json';

  interface Props {
    /** False when the device has no network at all. */
    online: boolean;
  }

  const { online }: Props = $props();
</script>

<!--
  Always in the page, so that screen readers announce the change; a live region without the
  "status" role, which stays for the messages of the screens.
-->
<span class="connectivity" aria-live="polite" data-testid="connectivity">
  {#if !online}
    <span class="offline" title={fr.pwa.offlineTitle}>{fr.pwa.offline}</span>
  {/if}
</span>

<style>
  .connectivity {
    display: contents;
  }

  .offline {
    padding: 2px var(--space-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    color: var(--ink-soft);
    background: var(--surface-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    white-space: nowrap;
  }
</style>
