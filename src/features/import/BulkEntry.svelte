<script lang="ts">
  import {
    parseBulkEntry,
    type BulkEntries,
    type BulkLineError,
  } from '../../domain/bulkEntryParser';
  import type { Card } from '../../domain/card';
  import { applyImportPlan, planImport } from '../../domain/importPlan';
  import type { Label } from '../../domain/label';
  import { resolveLabelChoice } from '../../domain/labelOperations';
  import { completeMissingPinyin, type PinyinGenerator } from '../../domain/pinyinGeneration';
  import LabelPicker from '../labels/LabelPicker.svelte';
  import { PinyinSource } from '../pinyinSource.svelte';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { BulkEntrySave } from './bulkEntrySave';

  interface Props {
    existingCards: readonly Card[];
    existingLabels: readonly Label[];
    loadPinyin: () => Promise<PinyinGenerator>;
    newId: () => string;
    clock: () => string;
    onSave: (save: BulkEntrySave) => Promise<void>;
  }

  const { existingCards, existingLabels, loadPinyin, newId, clock, onSave }: Props = $props();
  const pinyinSource = new PinyinSource(() => loadPinyin());

  /** Stands for the label being typed until it receives a real id on save. */
  const PENDING_LABEL_ID = 'pending-new-label';

  let text = $state('');
  let chosenLabelIds = $state<string[]>([]);
  let labelName = $state('');
  let status = $state<
    { kind: 'saved'; created: number; updated: number } | { kind: 'failed' } | undefined
  >();

  const parsed = $derived(parseBulkEntry(text));
  const needsPinyin = $derived(
    parsed.ok && parsed.value.entries.some(({ language, pinyin }) => language === 'zh' && !pinyin),
  );
  const batch = $derived(parsed.ok ? withPinyin(parsed.value, pinyinSource.generator) : undefined);

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

  function describe(error: BulkLineError): string {
    const reason =
      error.reason === 'duplicateInBatch'
        ? format(fr.bulkEntry.errors.duplicateInBatch, { first: error.firstLineNumber })
        : fr.bulkEntry.errors[error.reason];
    return format(fr.bulkEntry.errorLine, { line: error.lineNumber, reason });
  }

  async function save() {
    if (!parsed.ok) {
      return;
    }
    const batch = withPinyin(parsed.value, needsPinyin ? await pinyinSource.ready() : undefined);
    const now = clock();
    const choice = resolveLabelChoice(existingLabels, chosenLabelIds, labelName, {
      id: newId(),
      now,
    });
    if (!choice.ok) {
      return;
    }
    const plan = planImport(batch, existingCards, choice.value.labelIds);
    const changes = applyImportPlan(plan, { nextId: newId, now, source: 'manual' });
    try {
      await onSave({ newLabel: choice.value.newLabel, changes });
      status = {
        kind: 'saved',
        created: changes.cardsToCreate.length,
        updated: changes.cardsToUpdate.length,
      };
      text = '';
    } catch {
      status = { kind: 'failed' };
    }
  }
</script>

<section aria-labelledby="bulk-entry-title">
  <h2 id="bulk-entry-title">{fr.bulkEntry.title}</h2>
  <label for="bulk-entry-input">{fr.bulkEntry.inputLabel}</label>
  <textarea id="bulk-entry-input" rows="8" aria-describedby="bulk-entry-help" bind:value={text}
  ></textarea>
  <p id="bulk-entry-help" class="help">{fr.bulkEntry.inputHelp}</p>

  <LabelPicker
    legend={fr.bulkEntry.labelsLegend}
    idPrefix="bulk-entry"
    labels={existingLabels}
    bind:chosenLabelIds
    bind:labelName
    error={labelChoice.ok ? undefined : labelChoice.errors[0]}
  />

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

  {#if status?.kind === 'saved'}
    <p role="status">
      {status.created > 0
        ? format(fr.bulkEntry.saved, { count: status.created })
        : format(fr.bulkEntry.labelsAdded, { count: status.updated })}
    </p>
  {:else if status?.kind === 'failed'}
    <p role="alert" class="error">{fr.bulkEntry.saveFailed}</p>
  {/if}

  <button type="button" disabled={!canSave} onclick={save}>{saveText}</button>
</section>

<style>
  textarea {
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
