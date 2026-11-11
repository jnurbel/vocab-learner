<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { detectLanguage, type BulkLineError } from '../../domain/bulkEntryParser';
  import type { Card } from '../../domain/card';
  import { applyImportPlan, planImport } from '../../domain/importPlan';
  import type { Label } from '../../domain/label';
  import { resolveLabelChoice } from '../../domain/labelOperations';
  import type { Box } from '../../domain/photo/photoBlocks';
  import {
    addWord,
    editWord,
    fillMissingPinyin,
    mergeWithNext,
    nextToCheck,
    notebookNote,
    photoWordsBatch,
    removeWord,
    type PhotoWord,
    type PhotoWordEdit,
  } from '../../domain/photo/photoWords';
  import type { PinyinGenerator } from '../../domain/pinyinGeneration';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import LabelPicker from '../labels/LabelPicker.svelte';
  import { PinyinSource } from '../pinyinSource.svelte';
  import type { VocabularySave } from '../vocabularySave';

  /** Shows the lines of the photo, kept in memory only, through temporary blob: URLs. */
  interface PreviewUrls {
    create(image: Blob): string;
    revoke(url: string): void;
  }

  interface Props {
    words: PhotoWord[];
    /** The photo read, from which each line is cut for its thumbnail. */
    photo: Blob;
    cropPhoto: (photo: Blob, box: Box) => Promise<Blob>;
    previewUrls?: PreviewUrls;
    existingCards: readonly Card[];
    existingLabels: readonly Label[];
    loadPinyin: () => Promise<PinyinGenerator>;
    newId: () => string;
    clock: () => string;
    onSave: (save: VocabularySave) => Promise<void>;
    /** The expert screen of the zones; without it, no button leads there. */
    onAdjustZones?: () => void;
  }

  const {
    words: initialWords,
    photo,
    cropPhoto,
    previewUrls = {
      create: (image) => URL.createObjectURL(image),
      revoke: (url) => {
        URL.revokeObjectURL(url);
      },
    },
    existingCards,
    existingLabels,
    loadPinyin,
    newId,
    clock,
    onSave,
    onAdjustZones,
  }: Props = $props();

  /** Stands for the label being typed until it receives a real id on save. */
  const PENDING_LABEL_ID = 'pending-new-label';
  const COLUMNS = ['term', 'pinyin', 'meaning'] as const;
  type Column = (typeof COLUMNS)[number];
  const COLUMN_NAMES: Readonly<Record<Column, string>> = {
    term: fr.bulkEntry.columns.term,
    pinyin: fr.bulkEntry.columns.pinyin,
    meaning: fr.bulkEntry.columns.translation,
  };
  /** From this share of the words with a cell to check, the zones may have been found wrong. */
  const MANY_TO_CHECK = 0.4;

  // The words read are a starting point: the learner corrects them from there.
  // svelte-ignore state_referenced_locally
  let words = $state.raw<PhotoWord[]>(initialWords);
  let chosenLabelIds = $state<string[]>([]);
  let labelName = $state('');
  let announcement = $state('');
  let checking = $state<string>();
  let status = $state<{ kind: 'saved'; created: number; updated: number } | { kind: 'failed' }>();
  const pinyinSource = new PinyinSource(() => loadPinyin());
  const inputs: Record<string, HTMLInputElement | undefined> = {};
  /** The thumbnail of each band of the photo, by its box. */
  const thumbnails = new SvelteMap<string, string>();
  let destroyed = false;

  const batch = $derived(photoWordsBatch(words));
  const labelChoice = $derived(
    resolveLabelChoice(existingLabels, chosenLabelIds, labelName, {
      id: PENDING_LABEL_ID,
      now: '',
    }),
  );
  const plan = $derived(
    planImport(batch, existingCards, labelChoice.ok ? labelChoice.value.labelIds : chosenLabelIds),
  );
  const newCount = $derived(plan.newWords.length);
  const relabelled = $derived(
    plan.existingWords.filter(({ addedLabelIds }) => addedLabelIds.length > 0),
  );
  const canSave = $derived(
    labelChoice.ok && batch.errors.length === 0 && (newCount > 0 || relabelled.length > 0),
  );
  const toCheckCount = $derived(
    words.reduce((count, { toCheck }) => count + Number(toCheck.term) + Number(toCheck.meaning), 0),
  );
  const manyToCheck = $derived(
    words.length > 0 &&
      words.filter(({ toCheck }) => toCheck.term || toCheck.meaning).length / words.length >=
        MANY_TO_CHECK,
  );
  const saveText = $derived.by(() => {
    if (newCount === 0 && plan.existingWords.length > 0) {
      return fr.bulkEntry.addLabelsOnly;
    }
    return newCount === 1
      ? fr.bulkEntry.addWordsOne
      : format(fr.bulkEntry.addWordsMany, { count: newCount });
  });

  const boxKey = ({ x, y, width, height }: Box) => [x, y, width, height].join(',');

  $effect(() => {
    if (words.some(({ term }) => detectLanguage(term) === 'zh')) {
      pinyinSource.request();
    }
  });

  // Once, when the generator arrives: the words read before it get their pinyin.
  $effect(() => {
    const generate = pinyinSource.generator;
    if (generate !== undefined) {
      words = fillMissingPinyin(
        untrack(() => words),
        generate,
      );
    }
  });

  $effect(() => {
    for (const { box } of words) {
      if (box !== undefined && !thumbnails.has(boxKey(box))) {
        const key = boxKey(box);
        thumbnails.set(key, '');
        void cropPhoto(photo, box).then(
          (line) => {
            if (!destroyed) {
              thumbnails.set(key, previewUrls.create(line));
            }
          },
          () => undefined,
        );
      }
    }
  });

  onDestroy(() => {
    destroyed = true;
    for (const url of thumbnails.values()) {
      if (url !== '') {
        previewUrls.revoke(url);
      }
    }
  });

  function lineOf(id: string): number {
    return words.findIndex((word) => word.id === id) + 1;
  }

  function edit(id: string, change: PhotoWordEdit) {
    words = editWord(words, id, change, pinyinSource.generator);
  }

  async function focusCell(id: string, column: Column) {
    await tick();
    inputs[`${id}-${column}`]?.focus();
  }

  async function goToNextToCheck() {
    const next = nextToCheck(words, checking);
    const word = words.find(({ id }) => id === next);
    if (word === undefined) {
      return;
    }
    checking = word.id;
    announcement = format(fr.photoWords.nowChecking, { line: lineOf(word.id) });
    await focusCell(word.id, word.toCheck.term ? 'term' : 'meaning');
  }

  function merge(id: string) {
    words = mergeWithNext(words, id, pinyinSource.generator);
    announcement = fr.photoWords.merged;
  }

  function remove(id: string) {
    words = removeWord(words, id);
    announcement = fr.photoWords.removed;
  }

  async function add(afterId: string | undefined) {
    const id = newId();
    words = addWord(words, afterId, id);
    announcement = fr.photoWords.added;
    await focusCell(id, 'term');
  }

  function statusOf(line: number): string {
    if (plan.newWords.some((planned) => planned.lineNumber === line)) {
      return fr.bulkEntry.status.new;
    }
    if (plan.existingWords.some((planned) => planned.lineNumber === line)) {
      return fr.bulkEntry.status.existing;
    }
    const error = batch.errors.find((candidate) => candidate.lineNumber === line);
    return error === undefined ? '' : reasonOf(error);
  }

  function reasonOf(error: BulkLineError): string {
    return error.reason === 'duplicateInBatch'
      ? format(fr.bulkEntry.errors.duplicateInBatch, { first: error.firstLineNumber })
      : fr.bulkEntry.errors[error.reason];
  }

  function isToCheck(word: PhotoWord, column: Column): boolean {
    return column !== 'pinyin' && word.toCheck[column];
  }

  async function save() {
    const now = clock();
    const choice = resolveLabelChoice(existingLabels, chosenLabelIds, labelName, {
      id: newId(),
      now,
    });
    if (!choice.ok) {
      return;
    }
    const changes = applyImportPlan(planImport(batch, existingCards, choice.value.labelIds), {
      nextId: newId,
      now,
      source: 'photo',
    });
    try {
      await onSave({ newLabel: choice.value.newLabel, changes });
      status = {
        kind: 'saved',
        created: changes.cardsToCreate.length,
        updated: changes.cardsToUpdate.length,
      };
      words = [];
    } catch {
      status = { kind: 'failed' };
    }
  }
</script>

<section aria-labelledby="photo-words-title" class="photo-words">
  <h3 id="photo-words-title">{fr.photoImport.listTitle}</h3>

  {#if words.length > 0}
    <div class="checks">
      <p>
        {toCheckCount > 0
          ? format(fr.photoWords.toCheckCount, { count: toCheckCount })
          : fr.photoWords.allChecked}
      </p>
      {#if toCheckCount > 0}
        <button type="button" onclick={goToNextToCheck}>{fr.photoWords.nextToCheck}</button>
      {/if}
      {#if onAdjustZones !== undefined}
        {#if manyToCheck}
          <p class="many">{fr.photoWords.manyToCheck}</p>
        {/if}
        <button type="button" class="expert" onclick={onAdjustZones}
          >{fr.photoWords.adjustZones}</button
        >
      {/if}
    </div>

    <div class="table-scroll">
      <table>
        <caption>{fr.photoWords.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{fr.photoWords.columnLine}</th>
            <th scope="col">{fr.photoWords.columnPhoto}</th>
            {#each COLUMNS as column (column)}
              <th scope="col">{COLUMN_NAMES[column]}</th>
            {/each}
            <th scope="col">{fr.bulkEntry.columnStatus}</th>
            <th scope="col">{fr.photoWords.columnActions}</th>
          </tr>
        </thead>
        <tbody>
          {#each words as word, index (word.id)}
            {@const line = index + 1}
            {@const isChinese = detectLanguage(word.term) === 'zh'}
            {@const note = notebookNote(word)}
            {@const thumbnail =
              word.box === undefined ? '' : (thumbnails.get(boxKey(word.box)) ?? '')}
            <tr class:checking={checking === word.id}>
              <th scope="row">{line}</th>
              <td class="thumbnail">
                {#if thumbnail !== ''}
                  <img src={thumbnail} alt={format(fr.photoWords.thumbnailAlt, { line })} />
                {:else if word.box === undefined}
                  <span class="help">{fr.photoWords.noThumbnail}</span>
                {/if}
              </td>
              {#each COLUMNS as column (column)}
                <td class:to-check={isToCheck(word, column)}>
                  {#if column !== 'pinyin' || isChinese || word.term === ''}
                    <input
                      bind:this={inputs[`${word.id}-${column}`]}
                      type="text"
                      maxlength="600"
                      lang={column === 'term' && isChinese ? 'zh-CN' : undefined}
                      aria-label={format(fr.bulkEntry.cellLabel, {
                        column: COLUMN_NAMES[column],
                        line,
                      })}
                      aria-invalid={isToCheck(word, column) ? 'true' : undefined}
                      aria-describedby={isToCheck(word, column)
                        ? 'photo-words-to-check'
                        : undefined}
                      value={word[column]}
                      oninput={(event) => {
                        edit(word.id, { [column]: event.currentTarget.value });
                      }}
                    />
                  {/if}
                  {#if column === 'pinyin' && note !== undefined}
                    <p class="note" title={fr.photoWords.notebookHelp}>
                      {format(fr.photoWords.notebook, { pinyin: note })}
                    </p>
                  {/if}
                </td>
              {/each}
              <td class="status">{statusOf(line)}</td>
              <td class="actions">
                {#if index < words.length - 1}
                  <button
                    type="button"
                    aria-label={format(fr.photoWords.merge, { line })}
                    title={format(fr.photoWords.merge, { line })}
                    onclick={() => {
                      merge(word.id);
                    }}>⤓</button
                  >
                {/if}
                <button
                  type="button"
                  aria-label={format(fr.photoWords.addAfter, { line })}
                  title={format(fr.photoWords.addAfter, { line })}
                  onclick={() => void add(word.id)}>+</button
                >
                <button
                  type="button"
                  aria-label={format(fr.photoWords.remove, { line })}
                  title={format(fr.photoWords.remove, { line })}
                  onclick={() => {
                    remove(word.id);
                  }}>✕</button
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p id="photo-words-to-check" class="sr-only">{fr.photoWords.toCheck}</p>
  {:else if status === undefined}
    <p>{fr.photoWords.empty}</p>
  {/if}

  <button type="button" onclick={() => void add(undefined)}>{fr.photoWords.addAtEnd}</button>

  {#if plan.existingWords.length > 0}
    <p>{format(fr.bulkEntry.existingWords, { count: plan.existingWords.length })}</p>
  {/if}

  <LabelPicker
    legend={fr.bulkEntry.labelsLegend}
    idPrefix="photo-words"
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
  {:else}
    <p role="status" class="sr-only">{announcement}</p>
  {/if}

  <button type="button" class="primary" disabled={!canSave} onclick={save}>{saveText}</button>
</section>

<style>
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    align-items: center;
    margin: var(--space-3) 0;
  }

  .checks p {
    margin: 0;
  }

  .many {
    flex-basis: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--ochre-soft);
  }

  .expert {
    border-color: transparent;
    background: transparent;
    color: var(--muted);
    font-size: var(--text-sm);
    text-decoration: underline;
  }

  .table-scroll {
    margin: var(--space-3) 0;
    overflow-x: auto;
  }

  td {
    vertical-align: top;
  }

  .thumbnail img {
    display: block;
    width: 14rem;
    max-width: 40vw;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
  }

  table input[type='text'] {
    width: 100%;
    min-width: 6rem;
    min-height: var(--target);
  }

  table input[lang='zh-CN'] {
    font-size: var(--text-lg);
  }

  /* A cell to check: ochre and thicker, never colour alone (aria-invalid and the count say it). */
  .to-check input {
    border: 2px solid var(--ochre);
    background: var(--ochre-soft);
  }

  .checking {
    outline: 2px solid var(--jade);
    outline-offset: -2px;
  }

  .note {
    margin: var(--space-1) 0 0;
    color: var(--muted);
    font-size: var(--text-xs);
  }

  .status {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }

  .actions {
    white-space: nowrap;
  }

  .actions button {
    min-width: var(--target);
    min-height: var(--target);
    padding: 0;
  }

  .help {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
