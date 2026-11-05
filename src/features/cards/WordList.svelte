<script lang="ts">
  import type { Card, Language } from '../../domain/card';
  import { selectCards } from '../../domain/cardSelection';
  import type { Label } from '../../domain/label';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';

  interface Props {
    cards: readonly Card[];
    labels: readonly Label[];
  }

  const { cards, labels }: Props = $props();

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
    <label>
      {fr.wordList.labelFilter}
      <select bind:value={labelId}>
        <option value="">{fr.wordList.allLabels}</option>
        {#each labels as label (label.id)}
          <option value={label.id}>{label.name}</option>
        {/each}
      </select>
    </label>
    <label>
      {fr.wordList.languageFilter}
      <select bind:value={language}>
        <option value="">{fr.wordList.allLanguages}</option>
        {#each LANGUAGES as code (code)}
          <option value={code}>{fr.languages[code]}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if shown.length === 0}
    <p>{fr.wordList.empty}</p>
  {:else}
    <p aria-live="polite">{format(fr.wordList.count, { count: shown.length })}</p>
    <table>
      <caption>{fr.wordList.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{fr.wordList.columnTerm}</th>
          <th scope="col">{fr.wordList.columnPinyin}</th>
          <th scope="col">{fr.wordList.columnTranslation}</th>
          <th scope="col">{fr.wordList.columnLabels}</th>
        </tr>
      </thead>
      <tbody>
        {#each shown as card (card.id)}
          <tr>
            <td lang={card.language === 'zh' ? 'zh-CN' : 'en'}>{card.term}</td>
            <td>{card.pinyin ?? ''}</td>
            <td>{card.translation}</td>
            <td>{labelsOf(card)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }
</style>
