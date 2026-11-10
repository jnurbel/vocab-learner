<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import type { BulkLineError } from '../../domain/bulkEntryParser';
  import type { Card, CardSource } from '../../domain/card';
  import { applyImportPlan, planImport } from '../../domain/importPlan';
  import type { Label } from '../../domain/label';
  import { resolveLabelChoice } from '../../domain/labelOperations';
  import type { PinyinGenerator } from '../../domain/pinyinGeneration';
  import type { IgnoredTerm } from '../../domain/progressRecords';
  import { keepNewWords } from '../../domain/textImport/newWords';
  import type { SegmentAdjustment } from '../../domain/textImport/segmentAdjustments';
  import {
    textImportBatch,
    textWordKey,
    type TextWordChoice,
    type WordDecision,
  } from '../../domain/textImport/textImportBatch';
  import { extractTextWords, type TextWord } from '../../domain/textImport/textWords';
  import { format, formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import LabelPicker from '../labels/LabelPicker.svelte';
  import { PinyinSource } from '../pinyinSource.svelte';
  import type { VocabularySave } from '../vocabularySave';

  interface Props {
    existingCards: readonly Card[];
    existingLabels: readonly Label[];
    loadPinyin: () => Promise<PinyinGenerator>;
    /** The words marked "I already know it", read again after each save. */
    loadIgnoredTerms: () => Promise<IgnoredTerm[]>;
    newId: () => string;
    clock: () => string;
    onSave: (save: VocabularySave) => Promise<void>;
    /** A text read by another import (a photo), to start from. */
    initialText?: string;
    /** Makes the ids unique when several imports are on the page. */
    idPrefix?: string;
    source?: CardSource;
  }

  const {
    existingCards,
    existingLabels,
    loadPinyin,
    loadIgnoredTerms,
    newId,
    clock,
    onSave,
    initialText = '',
    idPrefix = 'text-import',
    source = 'manual',
  }: Props = $props();
  const pinyinSource = new PinyinSource(() => loadPinyin());

  /** Stands for the label being typed until it receives a real id on save. */
  const PENDING_LABEL_ID = 'pending-new-label';
  const DECISIONS: readonly WordDecision[] = ['add', 'known', 'skip'];

  // The text given by a photo is only a starting point: the learner edits it from there.
  // svelte-ignore state_referenced_locally
  let text = $state(initialText);
  let hideCommonWords = $state(false);
  let ignoredTerms = $state.raw<IgnoredTerm[]>([]);
  let adjustments = $state.raw<SegmentAdjustment[]>([]);
  /** The choices made in the preview, by word. */
  const choices = new SvelteMap<string, TextWordChoice>();
  let chosenLabelIds = $state<string[]>([]);
  let labelName = $state('');
  let status = $state<{ kind: 'saved'; added: number; known: number } | { kind: 'failed' }>();

  const extracted = $derived(extractTextWords(text, adjustments));
  const words = $derived(
    extracted.ok
      ? keepNewWords(extracted.value, { knownTerms: existingCards, ignoredTerms, hideCommonWords })
      : [],
  );
  const needsPinyin = $derived(words.some(({ language }) => language === 'zh'));
  const effectiveChoices = $derived(
    new Map(words.map((word) => [textWordKey(word), choiceOf(word)])),
  );
  const decided = $derived(textImportBatch(words, effectiveChoices));
  const labelChoice = $derived(
    resolveLabelChoice(existingLabels, chosenLabelIds, labelName, {
      id: PENDING_LABEL_ID,
      now: '',
    }),
  );
  const canSave = $derived(
    labelChoice.ok &&
      decided.batch.errors.length === 0 &&
      (decided.batch.entries.length > 0 || decided.ignoredTerms.length > 0),
  );

  onMount(() => {
    void refreshIgnoredTerms();
  });

  $effect(() => {
    if (needsPinyin) {
      pinyinSource.request();
    }
  });

  /** Without them (storage not ready), the words known already are simply proposed again. */
  async function refreshIgnoredTerms() {
    try {
      ignoredTerms = await loadIgnoredTerms();
    } catch {
      // Keeps the last list read.
    }
  }

  /** The pinyin proposed for a Chinese word until the learner corrects it. */
  function proposedPinyin(word: TextWord): string {
    return word.language === 'zh' ? (pinyinSource.generator?.(word.term).trim() ?? '') : '';
  }

  function choiceOf(word: TextWord): TextWordChoice {
    const chosen = choices.get(textWordKey(word));
    const pinyin = chosen?.pinyin ?? proposedPinyin(word);
    return {
      decision: chosen?.decision ?? 'skip',
      ...(pinyin === '' ? {} : { pinyin }),
      ...(chosen?.translation === undefined ? {} : { translation: chosen.translation }),
    };
  }

  function choose(word: TextWord, change: Partial<TextWordChoice>) {
    const key = textWordKey(word);
    const previous = choices.get(key);
    choices.set(key, { decision: previous?.decision ?? 'skip', ...previous, ...change });
  }

  /** Typing a meaning means the word is wanted, unless the learner already chose otherwise. */
  function typeMeaning(word: TextWord, translation: string) {
    const decided = choices.get(textWordKey(word))?.decision;
    choose(word, { translation, decision: decided ?? 'add' });
  }

  function adjust(adjustment: SegmentAdjustment) {
    adjustments = [...adjustments, adjustment];
  }

  /** The two parts of a Chinese word for each place it may be cut. */
  function cuts(word: TextWord): { at: number; first: string; second: string }[] {
    const characters = Array.from(word.term);
    if (word.language !== 'zh') {
      return [];
    }
    return characters.slice(1).map((_, index) => ({
      at: index + 1,
      first: characters.slice(0, index + 1).join(''),
      second: characters.slice(index + 1).join(''),
    }));
  }

  function describe(error: BulkLineError): string {
    const term = words[error.lineNumber - 1]?.term ?? '';
    return format(fr.textImport.errorLine, {
      term,
      reason: error.reason === 'duplicateInBatch' ? '' : fr.bulkEntry.errors[error.reason],
    });
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
    const plan = planImport(decided.batch, existingCards, choice.value.labelIds);
    const changes = applyImportPlan(plan, { nextId: newId, now, source });
    try {
      await onSave({
        newLabel: choice.value.newLabel,
        changes,
        ignoredTerms: decided.ignoredTerms,
      });
      status = {
        kind: 'saved',
        added: changes.cardsToCreate.length,
        known: decided.ignoredTerms.length,
      };
      await refreshIgnoredTerms();
    } catch {
      status = { kind: 'failed' };
    }
  }
</script>

<section aria-labelledby="{idPrefix}-title">
  <h2 id="{idPrefix}-title">{fr.textImport.title}</h2>
  <label for="{idPrefix}-input">{fr.textImport.inputLabel}</label>
  <textarea
    id="{idPrefix}-input"
    rows="8"
    aria-describedby="{idPrefix}-help"
    bind:value={text}
    oninput={() => {
      adjustments = [];
      status = undefined;
    }}></textarea>
  <p id="{idPrefix}-help" class="help">{fr.textImport.inputHelp}</p>

  <label class="option">
    <input type="checkbox" bind:checked={hideCommonWords} />
    {fr.textImport.hideCommonWords}
  </label>

  {#if !extracted.ok}
    <p role="alert" class="error">{fr.textImport.inputErrors.inputTooLong}</p>
  {:else if text.trim() !== '' && words.length === 0}
    <p>{fr.textImport.noNewWords}</p>
  {:else if words.length > 0}
    <p aria-live="polite" class="count">{formatCount(fr.textImport.newWordCount, words.length)}</p>
    <div class="table-scroll">
      <table>
        <caption>{fr.textImport.previewCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{fr.textImport.columns.term}</th>
            <th scope="col">{fr.textImport.columns.occurrences}</th>
            <th scope="col">{fr.textImport.columns.pinyin}</th>
            <th scope="col">{fr.textImport.columns.translation}</th>
            <th scope="col">{fr.textImport.columns.sentence}</th>
            <th scope="col">{fr.textImport.columns.decision}</th>
          </tr>
        </thead>
        <tbody>
          {#each words as word, index (textWordKey(word))}
            {@const choice = effectiveChoices.get(textWordKey(word))}
            {@const lang = word.language === 'zh' ? 'zh-CN' : 'en'}
            <tr>
              <th scope="row">
                <span class="term" {lang}>{word.term}</span>
                {#if word.forms.length > 0}
                  <span class="forms">
                    {format(fr.textImport.forms, { forms: word.forms.join(', ') })}
                  </span>
                {/if}
                <span class="adjust">
                  {#if word.followedBy !== undefined}
                    <button
                      type="button"
                      aria-label={format(fr.textImport.join, {
                        first: word.term,
                        second: word.followedBy,
                      })}
                      onclick={() => {
                        adjust({ kind: 'join', first: word.term, second: word.followedBy ?? '' });
                      }}>{format(fr.textImport.joinShort, { second: word.followedBy })}</button
                    >
                  {/if}
                  {#each cuts(word) as cut (cut.at)}
                    <button
                      type="button"
                      aria-label={format(fr.textImport.split, cut)}
                      onclick={() => {
                        adjust({ kind: 'split', term: word.term, at: cut.at });
                      }}>{cut.first}|{cut.second}</button
                    >
                  {/each}
                </span>
              </th>
              <td class="occurrences">{word.occurrences}</td>
              <td>
                {#if word.language === 'zh'}
                  <input
                    type="text"
                    maxlength="300"
                    aria-label={format(fr.textImport.pinyinLabel, { term: word.term })}
                    value={choice?.pinyin ?? ''}
                    oninput={(event) => {
                      choose(word, { pinyin: event.currentTarget.value });
                    }}
                  />
                {/if}
              </td>
              <td>
                <input
                  type="text"
                  maxlength="300"
                  aria-label={format(fr.textImport.translationLabel, { term: word.term })}
                  value={choice?.translation ?? ''}
                  oninput={(event) => {
                    typeMeaning(word, event.currentTarget.value);
                  }}
                />
              </td>
              <td class="sentence" {lang}>{word.sentence ?? ''}</td>
              <td>
                <div
                  role="radiogroup"
                  class="decisions"
                  aria-label={format(fr.textImport.decisionLabel, { term: word.term })}
                >
                  {#each DECISIONS as decision (decision)}
                    <label class="decision">
                      <input
                        type="radio"
                        name="{idPrefix}-decision-{index}"
                        value={decision}
                        checked={choice?.decision === decision}
                        onchange={() => {
                          choose(word, { decision });
                        }}
                      />
                      {fr.textImport.decisions[decision]}
                    </label>
                  {/each}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if decided.batch.errors.length > 0}
    <h3 id="{idPrefix}-errors">{fr.textImport.errorsTitle}</h3>
    <ul aria-labelledby="{idPrefix}-errors" class="error errors">
      {#each decided.batch.errors as error (error.lineNumber)}
        <li>{describe(error)}</li>
      {/each}
    </ul>
  {/if}

  <LabelPicker
    legend={fr.textImport.labelsLegend}
    {idPrefix}
    labels={existingLabels}
    bind:chosenLabelIds
    bind:labelName
    error={labelChoice.ok ? undefined : labelChoice.errors[0]}
  />

  {#if status?.kind === 'saved'}
    <p role="status">{format(fr.textImport.saved, status)}</p>
  {:else if status?.kind === 'failed'}
    <p role="alert" class="error">{fr.textImport.saveFailed}</p>
  {/if}

  <p class="summary">
    {format(fr.textImport.summary, {
      added: decided.batch.entries.length,
      known: decided.ignoredTerms.length,
    })}
  </p>
  <button type="button" class="primary" disabled={!canSave} onclick={save}
    >{fr.textImport.save}</button
  >
</section>

<style>
  label {
    display: block;
  }

  textarea {
    display: block;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--jade);
    border-radius: var(--radius-md);
    font-family: var(--font-hanzi), sans-serif;
    font-size: var(--text-md);
    line-height: 1.8;
  }

  .option {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    margin: var(--space-3) 0;
  }

  .table-scroll {
    margin: var(--space-4) 0;
  }

  table input[type='text'] {
    width: 100%;
    min-width: 6rem;
  }

  .term {
    display: block;
    font-size: var(--text-lg);
  }

  .term:lang(zh-CN) {
    font-family: var(--font-hanzi), sans-serif;
  }

  .forms,
  .sentence,
  .summary,
  .help {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .adjust {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .occurrences {
    text-align: center;
  }

  .decisions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .decision {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    white-space: nowrap;
  }

  .help {
    margin-top: var(--space-2);
  }

  .errors {
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-6);
    border-radius: var(--radius-md);
    background: var(--ochre-soft);
  }
</style>
