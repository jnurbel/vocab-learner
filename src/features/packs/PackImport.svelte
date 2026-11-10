<script lang="ts">
  import { termKey, type Card } from '../../domain/card';
  import type { Label } from '../../domain/label';
  import {
    applyPackImportPlan,
    planPackImport,
    type PackImportOutcome,
    type PackImportPlan,
    type PackWord,
  } from '../../domain/packImport';
  import { failure } from '../../domain/result';
  import { PACK_LIMITS, parseVocabPack, type VocabPack } from '../../domain/vocabPack';
  import { format, formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import { packIssueMessages } from './packIssueMessages';

  interface Props {
    existingCards: readonly Card[];
    existingLabels: readonly Label[];
    newId: () => string;
    clock: () => string;
    onSave: (outcome: PackImportOutcome) => Promise<void>;
  }

  const { existingCards, existingLabels, newId, clock, onSave }: Props = $props();
  const texts = fr.packImport;

  /** The validated pack chosen, until it is imported or set aside. */
  let pack = $state.raw<VocabPack>();
  let issues = $state.raw<string[]>([]);
  let status = $state<{ kind: 'saved'; created: number; updated: number } | { kind: 'failed' }>();
  /** A new file input after each import or cancel, so that the same file can be chosen again. */
  let inputVersion = $state(0);

  /** Planned again when the words change, so that the preview always tells the truth. */
  const plan = $derived(pack && planPackImport(pack, existingCards, existingLabels));

  /** What the preview tells about a plan. */
  function previewOf(chosen: PackImportPlan) {
    const relabelledCount = chosen.existingWords.filter(
      ({ addedLabelIndexes }) => addedLabelIndexes.length > 0,
    ).length;
    return {
      statusByWord: statusesOf(chosen),
      relabelledCount,
      unchangedCount: chosen.existingWords.length - relabelledCount,
      canImport: chosen.newWords.length > 0 || relabelledCount > 0,
      createdNames: labelNames(chosen, true),
      reusedNames: labelNames(chosen, false),
    };
  }

  function statusesOf(chosen: PackImportPlan): Map<string, string> {
    return new Map([
      ...chosen.newWords.map(({ word }) => [keyOf(word), texts.status.new] as const),
      ...chosen.existingWords.map(
        ({ card, addedLabelIndexes }) =>
          [
            keyOf(card),
            addedLabelIndexes.length > 0 ? texts.status.relabelled : texts.status.unchanged,
          ] as const,
      ),
    ]);
  }

  const keyOf = (word: Pick<PackWord, 'language' | 'term'>) => termKey(word.language, word.term);

  /** An untrusted file: bounded before being read, then validated. Never throws. */
  async function readPack(file: File) {
    if (file.size > PACK_LIMITS.characters) {
      return failure([{ path: '', code: 'fileTooLarge' }]);
    }
    try {
      return parseVocabPack(await file.text());
    } catch {
      return failure([{ path: '', code: 'unreadableFile' }]);
    }
  }

  async function choose(file: File | undefined) {
    status = undefined;
    pack = undefined;
    issues = [];
    if (file === undefined) {
      return;
    }
    const read = await readPack(file);
    if (read.ok) {
      pack = read.value;
    } else {
      issues = packIssueMessages(read.errors);
    }
  }

  function labelNames(chosen: PackImportPlan, created: boolean): string {
    return chosen.labels
      .filter(({ existing }) => (existing === undefined) === created)
      .map(({ name }) => name)
      .join(', ');
  }

  function labelsOf(word: PackWord, from: VocabPack): string {
    return from.labels
      .filter(({ id }) => word.labelIds.includes(id))
      .map(({ name }) => name)
      .join(', ');
  }

  function setAside() {
    pack = undefined;
    issues = [];
    inputVersion += 1;
  }

  async function importPack(confirmed: PackImportPlan) {
    const outcome = applyPackImportPlan(confirmed, { nextId: newId, now: clock() });
    try {
      await onSave(outcome);
      status = {
        kind: 'saved',
        created: outcome.changes.cardsToCreate.length,
        updated: outcome.changes.cardsToUpdate.length,
      };
      setAside();
    } catch {
      status = { kind: 'failed' };
    }
  }
</script>

<section aria-labelledby="pack-import-title">
  <h2 id="pack-import-title">{texts.title}</h2>
  <p class="help">{texts.intro}</p>
  <label for="pack-import-file">{texts.fileInput}</label>
  {#key inputVersion}
    <input
      id="pack-import-file"
      type="file"
      accept=".json,application/json"
      onchange={(event) => choose(event.currentTarget.files?.[0])}
    />
  {/key}

  {#if issues.length > 0}
    <div role="alert" class="issues">
      <p>{texts.errorsTitle}</p>
      <ul>
        {#each issues as issue (issue)}
          <li>{issue}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if pack !== undefined && plan !== undefined}
    {@const {
      statusByWord,
      relabelledCount,
      unchangedCount,
      canImport,
      createdNames,
      reusedNames,
    } = previewOf(plan)}
    <div class="table-scroll">
      <table>
        <caption>{texts.previewCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{texts.columnTerm}</th>
            <th scope="col">{texts.columnTranslation}</th>
            <th scope="col">{texts.columnLabels}</th>
            <th scope="col">{texts.columnStatus}</th>
          </tr>
        </thead>
        <tbody>
          {#each pack.cards as word (keyOf(word))}
            <tr>
              <th scope="row" lang={word.language === 'zh' ? 'zh-CN' : 'en'}>{word.term}</th>
              <td>{word.translation}</td>
              <td>{labelsOf(word, pack)}</td>
              <td class="status">{statusByWord.get(keyOf(word))}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <ul class="summary">
      <li>{format(texts.summaryNew, { count: plan.newWords.length })}</li>
      {#if relabelledCount > 0}
        <li>{format(texts.summaryRelabelled, { count: relabelledCount })}</li>
      {/if}
      {#if unchangedCount > 0}
        <li>{format(texts.summaryUnchanged, { count: unchangedCount })}</li>
      {/if}
      {#if createdNames !== ''}
        <li>{format(texts.createdLabels, { names: createdNames })}</li>
      {/if}
      {#if reusedNames !== ''}
        <li>{format(texts.reusedLabels, { names: reusedNames })}</li>
      {/if}
    </ul>

    {#if !canImport}
      <p>{texts.nothingToDo}</p>
    {/if}
    <div class="actions">
      <button type="button" class="primary" disabled={!canImport} onclick={() => importPack(plan)}
        >{plan.newWords.length > 0
          ? formatCount(texts.importWords, plan.newWords.length)
          : texts.addLabelsOnly}</button
      >
      <button type="button" onclick={setAside}>{texts.cancel}</button>
    </div>
  {/if}

  {#if status?.kind === 'saved'}
    <p role="status">{format(texts.saved, { created: status.created, updated: status.updated })}</p>
  {:else if status?.kind === 'failed'}
    <p role="alert" class="error">{texts.saveFailed}</p>
  {/if}
</section>

<style>
  label {
    display: block;
    font-weight: var(--weight-bold);
  }

  .help {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .table-scroll {
    margin: var(--space-4) 0;
  }

  .status {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }

  .issues {
    margin-top: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--ochre-soft);
    color: var(--ink);
  }

  .issues p {
    margin: 0;
    font-weight: var(--weight-bold);
  }

  .summary {
    padding-left: var(--space-5);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
