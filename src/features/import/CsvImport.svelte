<script lang="ts">
  import type { BulkLineError } from '../../domain/bulkEntryParser';
  import type { Card } from '../../domain/card';
  import { planCsvImport } from '../../domain/csv/csvImportPlan';
  import {
    readVocabularyCsv,
    VOCABULARY_CSV_LIMITS,
    type CsvEntries,
    type CsvInputError,
  } from '../../domain/csv/vocabularyCsv';
  import { applyImportPlan } from '../../domain/importPlan';
  import type { Label } from '../../domain/label';
  import { resolveLabelChoice } from '../../domain/labelOperations';
  import { completeMissingPinyin, type PinyinGenerator } from '../../domain/pinyinGeneration';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import LabelPicker from '../labels/LabelPicker.svelte';
  import { PinyinSource } from '../pinyinSource.svelte';
  import type { VocabularySave } from '../vocabularySave';

  interface Props {
    existingCards: readonly Card[];
    existingLabels: readonly Label[];
    loadPinyin: () => Promise<PinyinGenerator>;
    newId: () => string;
    clock: () => string;
    onSave: (save: VocabularySave) => Promise<void>;
  }

  const { existingCards, existingLabels, loadPinyin, newId, clock, onSave }: Props = $props();
  const pinyinSource = new PinyinSource(() => loadPinyin());

  /** Stands for the label being typed until it receives a real id on save. */
  const PENDING_LABEL_ID = 'pending-new-label';
  /** UTF-8 takes at most 4 bytes a character: a larger file cannot be within the bounds. */
  const MAX_FILE_BYTES = VOCABULARY_CSV_LIMITS.characters * 4;

  let read = $state.raw<CsvEntries>();
  let inputError = $state<CsvInputError | 'unreadable'>();
  let chosenLabelIds = $state<string[]>([]);
  let labelName = $state('');
  let status = $state<{ kind: 'saved'; created: number; updated: number } | { kind: 'failed' }>();

  const needsPinyin = $derived(
    read?.entries.some(({ language, pinyin }) => language === 'zh' && pinyin === undefined) ??
      false,
  );
  const batch = $derived(read && withPinyin(read, pinyinSource.generator));
  const labelChoice = $derived(
    resolveLabelChoice(existingLabels, chosenLabelIds, labelName, {
      id: PENDING_LABEL_ID,
      now: '',
    }),
  );
  const existingKeys = $derived(
    new Set(
      batch === undefined
        ? []
        : planCsvImport(
            batch,
            { existingCards, existingLabels, chosenLabelIds: [] },
            { nextId: () => PENDING_LABEL_ID, now: '' },
          ).plan.existingWords.map(({ lineNumber }) => lineNumber),
    ),
  );
  const canSave = $derived(labelChoice.ok && (batch?.entries.length ?? 0) > 0);

  $effect(() => {
    if (needsPinyin) {
      pinyinSource.request();
    }
  });

  function withPinyin(entries: CsvEntries, generate: PinyinGenerator | undefined): CsvEntries {
    return generate === undefined
      ? entries
      : { entries: completeMissingPinyin(entries.entries, generate), errors: entries.errors };
  }

  async function choose(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    read = undefined;
    inputError = undefined;
    status = undefined;
    if (file === undefined) {
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      inputError = 'inputTooLong';
      return;
    }
    try {
      const result = readVocabularyCsv(await file.text());
      if (result.ok) {
        read = result.value;
      } else {
        inputError = result.errors[0];
      }
    } catch {
      inputError = 'unreadable';
    }
  }

  function describe(error: BulkLineError): string {
    const reason =
      error.reason === 'duplicateInBatch'
        ? format(fr.bulkEntry.errors.duplicateInBatch, { first: error.firstLineNumber })
        : fr.bulkEntry.errors[error.reason];
    return format(fr.csvImport.errorLine, { line: error.lineNumber, reason });
  }

  async function save() {
    if (read === undefined) {
      return;
    }
    const entries = withPinyin(read, needsPinyin ? await pinyinSource.ready() : undefined);
    const now = clock();
    const choice = resolveLabelChoice(existingLabels, chosenLabelIds, labelName, {
      id: newId(),
      now,
    });
    if (!choice.ok) {
      return;
    }
    const { plan, newLabels } = planCsvImport(
      entries,
      { existingCards, existingLabels, chosenLabelIds: choice.value.labelIds },
      { nextId: newId, now },
    );
    const changes = applyImportPlan(plan, { nextId: newId, now, source: 'csv' });
    try {
      await onSave({ newLabel: choice.value.newLabel, newLabels, changes });
      status = {
        kind: 'saved',
        created: changes.cardsToCreate.length,
        updated: changes.cardsToUpdate.length,
      };
      read = undefined;
    } catch {
      status = { kind: 'failed' };
    }
  }
</script>

<section aria-labelledby="csv-import-title">
  <h2 id="csv-import-title">{fr.csvImport.title}</h2>
  <label for="csv-import-file">{fr.csvImport.fileLabel}</label>
  <input
    id="csv-import-file"
    type="file"
    accept=".csv,text/csv"
    aria-describedby="csv-import-help"
    onchange={choose}
  />
  <p id="csv-import-help" class="help">{fr.csvImport.help}</p>

  {#if inputError !== undefined}
    <p role="alert" class="error">{fr.csvImport.inputErrors[inputError]}</p>
  {/if}

  {#if batch !== undefined && batch.entries.length > 0}
    <div class="table-scroll">
      <table>
        <caption>{fr.csvImport.previewCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{fr.csvImport.columns.line}</th>
            <th scope="col">{fr.csvImport.columns.term}</th>
            <th scope="col">{fr.csvImport.columns.pinyin}</th>
            <th scope="col">{fr.csvImport.columns.translation}</th>
            <th scope="col">{fr.csvImport.columns.example}</th>
            <th scope="col">{fr.csvImport.columns.labels}</th>
            <th scope="col">{fr.csvImport.columns.status}</th>
          </tr>
        </thead>
        <tbody>
          {#each batch.entries as entry (entry.lineNumber)}
            <tr>
              <th scope="row">{entry.lineNumber}</th>
              <td lang={entry.language === 'zh' ? 'zh-CN' : 'en'}>{entry.term}</td>
              <td>{entry.pinyin ?? ''}</td>
              <td>{entry.translation}</td>
              <td>{entry.example ?? ''}</td>
              <td>{entry.labelNames.join(', ')}</td>
              <td class="status">
                {existingKeys.has(entry.lineNumber)
                  ? fr.csvImport.status.existing
                  : fr.csvImport.status.new}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if batch !== undefined && batch.errors.length > 0}
    <h3 id="csv-import-errors">{fr.csvImport.errorsTitle}</h3>
    <ul aria-labelledby="csv-import-errors" class="error errors">
      {#each batch.errors as error (error.lineNumber)}
        <li>{describe(error)}</li>
      {/each}
    </ul>
  {/if}

  <LabelPicker
    legend={fr.csvImport.labelsLegend}
    idPrefix="csv-import"
    labels={existingLabels}
    bind:chosenLabelIds
    bind:labelName
    error={labelChoice.ok ? undefined : labelChoice.errors[0]}
  />

  {#if status?.kind === 'saved'}
    <p role="status">{format(fr.csvImport.saved, status)}</p>
  {:else if status?.kind === 'failed'}
    <p role="alert" class="error">{fr.csvImport.saveFailed}</p>
  {/if}

  <button type="button" class="primary" disabled={!canSave} onclick={save}
    >{fr.csvImport.save}</button
  >
</section>

<style>
  label {
    display: block;
  }

  .help,
  .status {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .table-scroll {
    margin: var(--space-4) 0;
  }

  .errors {
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-6);
    border-radius: var(--radius-md);
    background: var(--ochre-soft);
  }
</style>
