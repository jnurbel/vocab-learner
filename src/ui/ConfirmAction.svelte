<script lang="ts">
  import { tick } from 'svelte';
  import fr from '../i18n/fr.json';

  interface Props {
    /** Visible text of the button. */
    text: string;
    /** Accessible name of the button, which must contain its visible text. */
    label: string;
    question: string;
    confirmText: string;
    onConfirm: () => void | Promise<void>;
    disabled?: boolean;
  }

  const { text, label, question, confirmText, onConfirm, disabled = false }: Props = $props();

  let asking = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let cancelButton = $state<HTMLButtonElement>();

  /** Cancel is focused first, so that a hasty Enter does not destroy anything. */
  async function ask() {
    asking = true;
    await tick();
    cancelButton?.focus();
  }

  async function cancel() {
    asking = false;
    await tick();
    trigger?.focus();
  }

  function cancelOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      void cancel();
    }
  }

  async function confirm() {
    asking = false;
    await onConfirm();
  }
</script>

<button type="button" aria-label={label} {disabled} bind:this={trigger} onclick={ask}>{text}</button
>
{#if asking}
  <div class="confirmation" role="group" aria-label={question}>
    <p>{question}</p>
    <button type="button" onclick={confirm} onkeydown={cancelOnEscape}>{confirmText}</button>
    <button type="button" bind:this={cancelButton} onclick={cancel} onkeydown={cancelOnEscape}
      >{fr.confirm.cancel}</button
    >
  </div>
{/if}

<style>
  .confirmation {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .confirmation p {
    margin: 0;
  }
</style>
