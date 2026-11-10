<script lang="ts">
  import type { InstallOffer } from '../../domain/pwa/installOffer';
  import fr from '../../i18n/fr.json';

  interface Props {
    /** What this browser allows: its install prompt, the steps for iOS, or nothing. */
    offer: InstallOffer;
    /** Shows the browser's install prompt; called from the click itself. */
    onInstall: () => void;
  }

  const { offer, onInstall }: Props = $props();
</script>

{#if offer === 'prompt'}
  <div class="install">
    <button type="button" class="primary" aria-describedby="install-help" onclick={onInstall}
      >{fr.pwa.install}</button
    >
    <p id="install-help" class="help">{fr.pwa.installHelp}</p>
  </div>
{:else if offer === 'iosHelp'}
  <details class="install">
    <summary>{fr.pwa.iosTitle}</summary>
    <p class="help">{fr.pwa.iosHelp}</p>
  </details>
{/if}

<style>
  .install {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }

  .install p {
    margin: 0;
  }

  summary {
    cursor: pointer;
    font-weight: var(--weight-bold);
  }
</style>
