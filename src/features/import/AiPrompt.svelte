<script lang="ts">
  import fr from '../../i18n/fr.json';

  interface Props {
    /** Puts the text on the clipboard; the clipboard of the browser by default. */
    copyText?: (text: string) => Promise<void>;
  }

  const { copyText = (text) => navigator.clipboard.writeText(text) }: Props = $props();

  let status = $state<'copied' | 'failed'>();

  async function copy() {
    try {
      await copyText(fr.aiPrompt.prompt);
      status = 'copied';
    } catch {
      status = 'failed';
    }
  }
</script>

<details>
  <summary>{fr.aiPrompt.title}</summary>
  <p class="help">{fr.aiPrompt.steps}</p>
  <p class="warning">{fr.aiPrompt.consent}</p>
  <label for="ai-prompt-text">{fr.aiPrompt.promptLabel}</label>
  <textarea id="ai-prompt-text" rows="8" readonly value={fr.aiPrompt.prompt}></textarea>
  <button type="button" onclick={copy}>{fr.aiPrompt.copy}</button>
  {#if status === 'copied'}
    <p role="status">{fr.aiPrompt.copied}</p>
  {:else if status === 'failed'}
    <p role="alert" class="error">{fr.aiPrompt.copyFailed}</p>
  {/if}
</details>

<style>
  details {
    margin-top: var(--space-4);
  }

  summary {
    cursor: pointer;
    font-weight: 600;
  }

  label {
    display: block;
  }

  textarea {
    width: 100%;
  }

  .help {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .warning {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--ochre-soft);
  }
</style>
