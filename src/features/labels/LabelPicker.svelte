<script lang="ts">
  import type { Label, LabelError } from '../../domain/label';
  import fr from '../../i18n/fr.json';

  interface Props {
    legend: string;
    /** Makes the ids unique when several forms are on the page. */
    idPrefix: string;
    labels: readonly Label[];
    chosenLabelIds: string[];
    labelName: string;
    error: LabelError | undefined;
  }

  let {
    legend,
    idPrefix,
    labels,
    chosenLabelIds = $bindable(),
    labelName = $bindable(),
    error,
  }: Props = $props();
</script>

<fieldset>
  <legend>{legend}</legend>
  {#each labels as label (label.id)}
    <label class="choice">
      <input type="checkbox" value={label.id} bind:group={chosenLabelIds} />
      {label.name}
    </label>
  {:else}
    <p>{fr.labelPicker.noLabels}</p>
  {/each}
  <label for="{idPrefix}-label-name">{fr.labelPicker.nameInput}</label>
  <input id="{idPrefix}-label-name" type="text" maxlength="200" bind:value={labelName} />
  {#if error !== undefined}
    <p role="alert" class="error">{fr.labelPicker.errors[error]}</p>
  {/if}
</fieldset>

<style>
  input[type='text'] {
    display: block;
    width: 100%;
  }

  .choice {
    display: inline-flex;
    gap: 0.25rem;
    margin-right: 1rem;
  }

  .error {
    color: var(--ochre);
  }
</style>
