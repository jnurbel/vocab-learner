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
  {#if labels.length > 0}
    <div class="choices">
      {#each labels as label (label.id)}
        <label class="choice">
          <input type="checkbox" value={label.id} bind:group={chosenLabelIds} />
          {label.name}
        </label>
      {/each}
    </div>
  {:else}
    <p class="empty">{fr.labelPicker.noLabels}</p>
  {/if}
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

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  /* Labels to set show as chips, as in docs/ui/mockups/Import.dc.html; the row spaces them. */
  .choices .choice {
    margin: 0;
  }

  .empty {
    color: var(--muted);
  }

  .error {
    margin: var(--space-2) 0 0;
    color: var(--ochre);
    font-weight: var(--weight-bold);
  }
</style>
