<script lang="ts">
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';

  interface Props {
    /** The version in use, which the update replaces. */
    version: string;
    /** Lets the new version take over; the app reloads once it does. */
    onUpdate: () => Promise<void>;
    /** Hides the banner until the next start of the app. */
    onLater: () => void;
  }

  const { version, onUpdate, onLater }: Props = $props();

  let updating = $state(false);

  async function update() {
    updating = true;
    try {
      await onUpdate();
    } catch {
      // The new version could not take over: the button stays, to try again.
      updating = false;
    }
  }
</script>

<aside class="update" aria-labelledby="update-title">
  <p>
    <strong id="update-title">{fr.pwa.updateTitle}</strong>
    <span>{format(fr.pwa.updateText, { version })}</span>
  </p>
  <div class="actions">
    <button type="button" class="primary" disabled={updating} onclick={update}
      >{updating ? fr.pwa.updating : fr.pwa.update}</button
    >
    <button type="button" disabled={updating} onclick={onLater}>{fr.pwa.updateLater}</button>
  </div>
</aside>

<style>
  .update {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-3) var(--space-4);
    background: var(--jade-soft);
    color: var(--ink);
    border: 1px solid var(--line);
    border-left: 4px solid var(--jade);
    border-radius: var(--radius-md);
  }

  p {
    display: flex;
    flex: 1 1 100%;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
  }

  strong {
    font-weight: var(--weight-heavy);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
