<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { applyEntryEdits, type EntryEdit } from '../../domain/batchEdits';
  import {
    detectLanguage,
    parseBulkEntry,
    type BulkEntries,
    type BulkEntry,
    type BulkLineError,
  } from '../../domain/bulkEntryParser';
  import type { Card, CardSource } from '../../domain/card';
  import { applyImportPlan, planImport } from '../../domain/importPlan';
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
    /** A list read by another import (a photo), to start from. */
    initialText?: string;
    /** Makes the ids unique when several entries are on the page. */
    idPrefix?: string;
    title?: string;
    source?: CardSource;
  }

  const {
    existingCards,
    existingLabels,
    loadPinyin,
    newId,
    clock,
    onSave,
    initialText = '',
    idPrefix = 'bulk-entry',
    title = fr.bulkEntry.title,
    source = 'manual',
  }: Props = $props();
  const pinyinSource = new PinyinSource(() => loadPinyin());

  /** Stands for the label being typed until it receives a real id on save. */
  const PENDING_LABEL_ID = 'pending-new-label';
  const EDITABLE_COLUMNS = ['term', 'pinyin', 'translation'] as const;
  type EditableColumn = (typeof EDITABLE_COLUMNS)[number];

  // The list given by a photo is only a starting point: the learner edits it from there.
  // svelte-ignore state_referenced_locally
  let text = $state(initialText);
  /** Corrections made in the preview, by line number; they apply to the text as pasted. */
  const edits = new SvelteMap<number, EntryEdit>();
  let chosenLabelIds = $state<string[]>([]);
  let labelName = $state('');
  let status = $state<
    { kind: 'saved'; created: number; updated: number } | { kind: 'failed' } | undefined
  >();

  const parsed = $derived(parseBulkEntry(text));
  const edited = $derived(parsed.ok ? applyEntryEdits(parsed.value, edits) : undefined);
  const needsPinyin = $derived(
    edited?.entries.some(({ language, pinyin }) => language === 'zh' && pinyin === undefined) ??
      false,
  );
  const batch = $derived(edited && withPinyin(edited, pinyinSource.generator));
  const labelChoice = $derived(
    resolveLabelChoice(existingLabels, chosenLabelIds, labelName, {
      id: PENDING_LABEL_ID,
      now: '',
    }),
  );
  const preview = $derived(
    batch &&
      planImport(
        batch,
        existingCards,
        labelChoice.ok ? labelChoice.value.labelIds : chosenLabelIds,
      ),
  );
  const newWordCount = $derived(preview?.newWords.length ?? 0);
  const relabelledCount = $derived(
    preview?.existingWords.filter(({ addedLabelIds }) => addedLabelIds.length > 0).length ?? 0,
  );
  const canSave = $derived(labelChoice.ok && (newWordCount > 0 || relabelledCount > 0));
  const saveText = $derived.by(() => {
    if (newWordCount === 0 && (preview?.existingWords.length ?? 0) > 0) {
      return fr.bulkEntry.addLabelsOnly;
    }
    return newWordCount === 1
      ? fr.bulkEntry.addWordsOne
      : format(fr.bulkEntry.addWordsMany, { count: newWordCount });
  });

  $effect(() => {
    if (needsPinyin) {
      pinyinSource.request();
    }
  });

  function withPinyin(entries: BulkEntries, generate: PinyinGenerator | undefined): BulkEntries {
    return generate === undefined
      ? entries
      : { entries: completeMissingPinyin(entries.entries, generate), errors: entries.errors };
  }

  function editLine(lineNumber: number, change: EntryEdit) {
    edits.set(lineNumber, { ...edits.get(lineNumber), ...change });
  }

  /** What a preview cell shows: the correction, otherwise the value to be saved. */
  function shown(line: BulkEntry, column: EditableColumn): string {
    const corrected = edits.get(line.lineNumber)?.[column];
    if (corrected !== undefined) {
      return corrected;
    }
    const planned = batch?.entries.find(({ lineNumber }) => lineNumber === line.lineNumber);
    return (planned ?? line)[column] ?? '';
  }

  function isExcluded(lineNumber: number): boolean {
    return edits.get(lineNumber)?.excluded === true;
  }

  function lineStatus(lineNumber: number): string {
    if (isExcluded(lineNumber)) {
      return fr.bulkEntry.status.excluded;
    }
    if (preview?.newWords.some((word) => word.lineNumber === lineNumber)) {
      return fr.bulkEntry.status.new;
    }
    if (preview?.existingWords.some((word) => word.lineNumber === lineNumber)) {
      return fr.bulkEntry.status.existing;
    }
    const error = preview?.errors.find((candidate) => candidate.lineNumber === lineNumber);
    return error === undefined ? '' : reasonOf(error);
  }

  function reasonOf(error: BulkLineError): string {
    return error.reason === 'duplicateInBatch'
      ? format(fr.bulkEntry.errors.duplicateInBatch, { first: error.firstLineNumber })
      : fr.bulkEntry.errors[error.reason];
  }

  function describe(error: BulkLineError): string {
    return format(fr.bulkEntry.errorLine, { line: error.lineNumber, reason: reasonOf(error) });
  }

  async function save() {
    if (edited === undefined) {
      return;
    }
    const batch = withPinyin(edited, needsPinyin ? await pinyinSource.ready() : undefined);
    const now = clock();
    const choice = resolveLabelChoice(existingLabels, chosenLabelIds, labelName, {
      id: newId(),
      now,
    });
    if (!choice.ok) {
      return;
    }
    const plan = planImport(batch, existingCards, choice.value.labelIds);
    const changes = applyImportPlan(plan, { nextId: newId, now, source });
    try {
      await onSave({ newLabel: choice.value.newLabel, changes });
      status = {
        kind: 'saved',
        created: changes.cardsToCreate.length,
        updated: changes.cardsToUpdate.length,
      };
      text = '';
      edits.clear();
    } catch {
      status = { kind: 'failed' };
    }
  }
</script>

<section aria-labelledby="{idPrefix}-title">
  <h2 id="{idPrefix}-title">{title}</h2>
  <label for="{idPrefix}-input">{fr.bulkEntry.inputLabel}</label>
  <textarea
    id="{idPrefix}-input"
    rows="8"
    aria-describedby="{idPrefix}-help"
    bind:value={text}
    oninput={() => {
      edits.clear();
    }}></textarea>
  <p id="{idPrefix}-help" class="help">{fr.bulkEntry.inputHelp}</p>

  {#if !parsed.ok}
    <p role="alert" class="error">{fr.bulkEntry.inputErrors[parsed.errors[0] ?? 'inputTooLong']}</p>
  {:else if parsed.value.entries.length > 0}
    <div class="table-scroll">
      <table>
        <caption>{fr.bulkEntry.previewCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{fr.bulkEntry.columnLine}</th>
            {#each EDITABLE_COLUMNS as column (column)}
              <th scope="col">{fr.bulkEntry.columns[column]}</th>
            {/each}
            <th scope="col">{fr.bulkEntry.columnStatus}</th>
            <th scope="col">{fr.bulkEntry.columnExclude}</th>
          </tr>
        </thead>
        <tbody>
          {#each parsed.value.entries as line (line.lineNumber)}
            {@const isChinese = detectLanguage(shown(line, 'term')) === 'zh'}
            <tr class:excluded={isExcluded(line.lineNumber)}>
              <th scope="row">{line.lineNumber}</th>
              {#each EDITABLE_COLUMNS as column (column)}
                <td>
                  {#if column !== 'pinyin' || isChinese}
                    <input
                      type="text"
                      maxlength="600"
                      lang={column === 'term' && isChinese ? 'zh-CN' : undefined}
                      aria-label={format(fr.bulkEntry.cellLabel, {
                        column: fr.bulkEntry.columns[column],
                        line: line.lineNumber,
                      })}
                      value={shown(line, column)}
                      disabled={isExcluded(line.lineNumber)}
                      oninput={(event) => {
                        editLine(line.lineNumber, { [column]: event.currentTarget.value });
                      }}
                    />
                  {/if}
                </td>
              {/each}
              <td class="status">{lineStatus(line.lineNumber)}</td>
              <td>
                <input
                  type="checkbox"
                  aria-label={format(fr.bulkEntry.excludeLine, { line: line.lineNumber })}
                  checked={isExcluded(line.lineNumber)}
                  onchange={(event) => {
                    editLine(line.lineNumber, { excluded: event.currentTarget.checked });
                  }}
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if preview && preview.existingWords.length > 0}
    <p>{format(fr.bulkEntry.existingWords, { count: preview.existingWords.length })}</p>
  {/if}

  {#if preview && preview.errors.length > 0}
    <h3 id="{idPrefix}-errors">{fr.bulkEntry.errorsTitle}</h3>
    <ul aria-labelledby="{idPrefix}-errors" class="error errors">
      {#each preview.errors as error (error.lineNumber)}
        <li>{describe(error)}</li>
      {/each}
    </ul>
  {/if}

  <LabelPicker
    legend={fr.bulkEntry.labelsLegend}
    {idPrefix}
    labels={existingLabels}
    bind:chosenLabelIds
    bind:labelName
    error={labelChoice.ok ? undefined : labelChoice.errors[0]}
  />

  {#if status?.kind === 'saved'}
    <p role="status">
      {status.created > 0
        ? format(fr.bulkEntry.saved, { count: status.created })
        : format(fr.bulkEntry.labelsAdded, { count: status.updated })}
    </p>
  {:else if status?.kind === 'failed'}
    <p role="alert" class="error">{fr.bulkEntry.saveFailed}</p>
  {/if}

  <button type="button" class="primary" disabled={!canSave} onclick={save}>{saveText}</button>
</section>

<style>
  label {
    display: block;
  }

  /* The lines to import, as in docs/ui/mockups/Import.dc.html. */
  textarea {
    display: block;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--jade);
    border-radius: var(--radius-md);
    font-family: ui-monospace, 'Cascadia Mono', Consolas, var(--font-hanzi), monospace;
    font-size: var(--text-md);
    line-height: 1.8;
  }

  .table-scroll {
    margin: var(--space-4) 0;
  }

  table input[type='text'] {
    width: 100%;
    min-width: 6rem;
  }

  table input[lang='zh-CN'] {
    font-size: var(--text-lg);
  }

  .status {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }

  .excluded {
    color: var(--muted);
    text-decoration: line-through;
  }

  .help {
    margin-top: var(--space-2);
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .errors {
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-6);
    border-radius: var(--radius-md);
    background: var(--ochre-soft);
  }
</style>
