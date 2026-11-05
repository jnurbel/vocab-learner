<script lang="ts">
  import { parseBulkEntry, type BulkLineError } from '../../domain/bulkEntryParser';
  import type { Card } from '../../domain/card';
  import { applyImportPlan, planImport, type ImportChanges } from '../../domain/importPlan';
  import type { Label } from '../../domain/label';
  import { findOrCreateLabel } from '../../domain/labelOperations';
  import { completeMissingPinyin, type PinyinGenerator } from '../../domain/pinyinGeneration';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';

  export interface BulkEntrySave {
    /** Set when the typed label did not exist and must be stored with the words. */
    newLabel: Label | undefined;
    changes: ImportChanges;
  }

  interface Props {
    existingCards: readonly Card[];
    existingLabels: readonly Label[];
    generatePinyin: PinyinGenerator;
    newId: () => string;
    clock: () => string;
    onSave: (save: BulkEntrySave) => Promise<void>;
  }

  const { existingCards, existingLabels, generatePinyin, newId, clock, onSave }: Props = $props();

  let text = $state('');
  let labelName = $state('');

  const parsed = $derived(parseBulkEntry(text));
  const batch = $derived(
    parsed.ok
      ? {
          entries: completeMissingPinyin(parsed.value.entries, generatePinyin),
          errors: parsed.value.errors,
        }
      : undefined,
  );
  const preview = $derived(batch && planImport(batch, existingCards, []));
  const newWordCount = $derived(preview?.newWords.length ?? 0);
  const labelError = $derived(
    labelName.trim() === ''
      ? undefined
      : findOrCreateLabel(existingLabels, labelName, { id: 'preview', now: '' }),
  );
  const canSave = $derived(newWordCount > 0 && (labelError === undefined || labelError.ok));

  function describe(error: BulkLineError): string {
    const reason =
      error.reason === 'duplicateInBatch'
        ? format(fr.bulkEntry.errors.duplicateInBatch, { first: error.firstLineNumber })
        : fr.bulkEntry.errors[error.reason];
    return format(fr.bulkEntry.errorLine, { line: error.lineNumber, reason });
  }

  async function save() {
    if (batch === undefined) {
      return;
    }
    const now = clock();
    const label =
      labelName.trim() === ''
        ? undefined
        : findOrCreateLabel(existingLabels, labelName, { id: newId(), now });
    if (label?.ok === false) {
      return;
    }
    const labelIds = label === undefined ? [] : [label.value.label.id];
    const plan = planImport(batch, existingCards, labelIds);
    await onSave({
      newLabel: label?.value.created ? label.value.label : undefined,
      changes: applyImportPlan(plan, { nextId: newId, now, source: 'manual' }),
    });
  }
</script>

<section>
  <h2>{fr.bulkEntry.title}</h2>
  <label for="bulk-entry-input">{fr.bulkEntry.inputLabel}</label>
  <textarea id="bulk-entry-input" rows="8" bind:value={text}></textarea>
  <p class="help">{fr.bulkEntry.inputHelp}</p>

  <label for="bulk-entry-label">{fr.bulkEntry.labelInput}</label>
  <input id="bulk-entry-label" type="text" bind:value={labelName} />
  {#if labelError?.ok === false}
    <p role="alert" class="error">{fr.bulkEntry.labelErrors[labelError.errors[0] ?? 'required']}</p>
  {/if}

  {#if !parsed.ok}
    <p role="alert" class="error">{fr.bulkEntry.inputErrors[parsed.errors[0] ?? 'inputTooLong']}</p>
  {/if}

  {#if preview && preview.newWords.length > 0}
    <table>
      <caption>{fr.bulkEntry.newWordsCaption}</caption>
      <thead>
        <tr>
          <th scope="col">{fr.bulkEntry.columnTerm}</th>
          <th scope="col">{fr.bulkEntry.columnPinyin}</th>
          <th scope="col">{fr.bulkEntry.columnTranslation}</th>
        </tr>
      </thead>
      <tbody>
        {#each preview.newWords as word (word.lineNumber)}
          <tr>
            <td lang={word.language === 'zh' ? 'zh-CN' : 'en'}>{word.term}</td>
            <td>{word.pinyin ?? ''}</td>
            <td>{word.translation}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if preview && preview.existingWords.length > 0}
    <p>{format(fr.bulkEntry.existingWords, { count: preview.existingWords.length })}</p>
  {/if}

  {#if preview && preview.errors.length > 0}
    <h3 id="bulk-entry-errors">{fr.bulkEntry.errorsTitle}</h3>
    <ul aria-labelledby="bulk-entry-errors" class="error">
      {#each preview.errors as error (error.lineNumber)}
        <li>{describe(error)}</li>
      {/each}
    </ul>
  {/if}

  <button type="button" disabled={!canSave} onclick={save}>
    {newWordCount === 1
      ? fr.bulkEntry.addWordsOne
      : format(fr.bulkEntry.addWordsMany, { count: newWordCount })}
  </button>
</section>

<style>
  textarea,
  input {
    display: block;
    width: 100%;
  }

  .help {
    font-size: 0.9rem;
  }

  .error {
    color: #b00020;
  }
</style>
