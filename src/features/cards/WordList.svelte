<script lang="ts">
  import type { Card, Language } from '../../domain/card';
  import { selectCards } from '../../domain/cardSelection';
  import type { Label } from '../../domain/label';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import ConfirmAction from '../../ui/ConfirmAction.svelte';
  import Pinyin from '../../ui/Pinyin.svelte';
  import type { WordProgress } from '../progress/wordProgress';

  interface Props {
    cards: readonly Card[];
    labels: readonly Label[];
    onEdit?: (card: Card) => void;
    onDelete?: (card: Card) => Promise<void>;
    /** Stage and thirst of a word; the column is hidden without it. */
    progressOf?: (card: Card) => WordProgress;
    /** Exports the words shown, after the filters; the button is hidden without it. */
    onExportCsv?: (cards: readonly Card[]) => void;
  }

  const { cards, labels, onEdit, onDelete, progressOf, onExportCsv }: Props = $props();

  let deletion = $state<{ kind: 'done'; term: string } | { kind: 'failed' } | undefined>();

  async function remove(card: Card) {
    try {
      await onDelete?.(card);
      deletion = { kind: 'done', term: card.term };
    } catch {
      deletion = { kind: 'failed' };
    }
  }

  const LANGUAGES: readonly Language[] = ['zh', 'en'];

  /** Empty string means "all". */
  let labelId = $state('');
  let language = $state<Language | ''>('');

  const shown = $derived(
    selectCards(cards, {
      labelIds: labelId === '' ? [] : [labelId],
      ...(language === '' ? {} : { language }),
    }),
  );
  const labelNames = $derived(new Map(labels.map((label) => [label.id, label.name])));

  /** Text first: the stage and the thirst are never told by a colour alone. */
  function badgeOf({ stage, thirst }: WordProgress): string {
    return thirst === 0
      ? fr.stages[stage]
      : format(fr.wordList.progressBadge, { stage: fr.stages[stage], thirst: fr.thirst[thirst] });
  }

  function labelsOf(card: Card): string {
    return card.labelIds
      .map((id) => labelNames.get(id))
      .filter((name) => name !== undefined)
      .join(', ');
  }
</script>

<section aria-labelledby="word-list-title">
  <h2 id="word-list-title">{fr.wordList.title}</h2>

  <div class="filters">
    <div>
      <label for="word-list-label">{fr.wordList.labelFilter}</label>
      <select id="word-list-label" bind:value={labelId}>
        <option value="">{fr.wordList.allLabels}</option>
        {#each labels as label (label.id)}
          <option value={label.id}>{label.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="word-list-language">{fr.wordList.languageFilter}</label>
      <select id="word-list-language" bind:value={language}>
        <option value="">{fr.wordList.allLanguages}</option>
        {#each LANGUAGES as code (code)}
          <option value={code}>{fr.languages[code]}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if deletion?.kind === 'done'}
    <p role="status">{format(fr.wordList.deleted, { term: deletion.term })}</p>
  {:else if deletion?.kind === 'failed'}
    <p role="alert" class="error">{fr.wordList.deleteFailed}</p>
  {/if}

  {#if shown.length === 0}
    <p>{fr.wordList.empty}</p>
  {:else}
    <p aria-live="polite" class="count">{format(fr.wordList.count, { count: shown.length })}</p>
    {#if onExportCsv !== undefined}
      <button
        type="button"
        onclick={() => {
          onExportCsv(shown);
        }}>{fr.csvImport.exportButton}</button
      >
    {/if}
    <div class="table-scroll">
      <table>
        <caption>{fr.wordList.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{fr.wordList.columnTerm}</th>
            <th scope="col">{fr.wordList.columnPinyin}</th>
            <th scope="col">{fr.wordList.columnTranslation}</th>
            <th scope="col">{fr.wordList.columnLabels}</th>
            {#if progressOf !== undefined}
              <th scope="col">{fr.wordList.columnProgress}</th>
            {/if}
            <th scope="col">{fr.wordList.columnActions}</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as card (card.id)}
            <tr>
              <td class="term" lang={card.language === 'zh' ? 'zh-CN' : 'en'}>{card.term}</td>
              <td><Pinyin pinyin={card.pinyin ?? ''} /></td>
              <td>{card.translation}</td>
              <td>{labelsOf(card)}</td>
              {#if progressOf !== undefined}
                <td><span class="badge">{badgeOf(progressOf(card))}</span></td>
              {/if}
              <td>
                <div class="actions">
                  <button
                    type="button"
                    aria-label={format(fr.wordList.editWord, { term: card.term })}
                    onclick={() => onEdit?.(card)}>{fr.wordList.edit}</button
                  >
                  <ConfirmAction
                    text={fr.wordList.delete}
                    label={format(fr.wordList.deleteWord, { term: card.term })}
                    question={format(fr.wordList.confirmDelete, { term: card.term })}
                    confirmText={fr.wordList.confirmDeleteButton}
                    onConfirm={() => remove(card)}
                  />
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    margin-bottom: var(--space-4);
  }

  .filters > div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .count {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  /* The table scrolls inside its card on a phone, rather than squeezing each word. */
  td {
    white-space: nowrap;
  }

  .term {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    white-space: nowrap;
  }

  .badge {
    display: inline-block;
    border-radius: var(--radius-pill);
    padding: 2px var(--space-3);
    background: var(--jade-soft);
    color: var(--jade-strong);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
    white-space: nowrap;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
