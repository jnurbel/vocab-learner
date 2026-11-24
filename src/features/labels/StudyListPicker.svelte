<script lang="ts">
  import type { Card, Language } from '../../domain/card';
  import type { Label } from '../../domain/label';
  import { countWordsByLabel } from '../../domain/labelOperations';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';

  interface Props {
    labels: readonly Label[];
    cards: readonly Card[];
    /** Only the lists that have words in this language are offered. */
    language: Language;
    /** The chosen lists; empty: every word of the language. */
    labelIds: string[];
  }

  let { labels, cards, language, labelIds = $bindable() }: Props = $props();

  /** The lists of the language, each with its number of words in it. */
  const lists = $derived(
    countWordsByLabel(
      labels,
      cards.filter((card) => card.language === language),
    ).filter(({ wordCount }) => wordCount > 0),
  );

  // A list left behind by a change of language would select nothing.
  $effect(() => {
    const offered = new Set(lists.map(({ label }) => label.id));
    if (labelIds.some((id) => !offered.has(id))) {
      labelIds = labelIds.filter((id) => offered.has(id));
    }
  });
</script>

<fieldset>
  <legend>{fr.studyLists.legend}</legend>
  {#if lists.length === 0}
    <p class="help">{fr.studyLists.none}</p>
  {:else}
    {#each lists as { label, wordCount } (label.id)}
      <label class="choice">
        <input type="checkbox" value={label.id} bind:group={labelIds} />
        {label.name}
        <span class="count">{format(fr.studyLists.count, { count: wordCount })}</span>
      </label>
    {/each}
  {/if}
</fieldset>

<style>
  .count {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .help {
    margin: 0;
    font-size: var(--text-sm);
  }
</style>
