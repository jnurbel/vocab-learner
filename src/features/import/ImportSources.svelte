<script lang="ts">
  import type { Card } from '../../domain/card';
  import type { Label } from '../../domain/label';
  import type { PinyinGenerator } from '../../domain/pinyinGeneration';
  import type { IgnoredTerm } from '../../domain/progressRecords';
  import fr from '../../i18n/fr.json';
  import type { VocabularySave } from '../vocabularySave';
  import TextImport from './TextImport.svelte';

  interface Props {
    existingCards: readonly Card[];
    existingLabels: readonly Label[];
    loadPinyin: () => Promise<PinyinGenerator>;
    loadIgnoredTerms: () => Promise<IgnoredTerm[]>;
    newId: () => string;
    clock: () => string;
    onSave: (save: VocabularySave) => Promise<void>;
  }

  const props: Props = $props();

  const SOURCES = ['text', 'csv', 'photo'] as const;
  type Source = (typeof SOURCES)[number];

  let selected = $state<Source>('text');
  const tabs: Partial<Record<Source, HTMLButtonElement>> = {};

  /** Arrow keys move along the tabs and wrap around, as in the WAI-ARIA tabs pattern. */
  function onKeydown(event: KeyboardEvent) {
    const index = SOURCES.indexOf(selected);
    const last = SOURCES.length - 1;
    const target = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    select(SOURCES[target] ?? 'text');
  }

  function select(source: Source) {
    selected = source;
    tabs[source]?.focus();
  }
</script>

<section aria-labelledby="import-sources-title">
  <h2 id="import-sources-title">{fr.importSources.title}</h2>
  <div role="tablist" aria-label={fr.importSources.tabsLabel} tabindex="-1" onkeydown={onKeydown}>
    {#each SOURCES as source (source)}
      <button
        bind:this={tabs[source]}
        type="button"
        role="tab"
        id="import-tab-{source}"
        aria-controls="import-panel-{source}"
        aria-selected={selected === source}
        tabindex={selected === source ? 0 : -1}
        onclick={() => {
          select(source);
        }}>{fr.importSources.tabs[source]}</button
      >
    {/each}
  </div>

  <div role="tabpanel" id="import-panel-{selected}" aria-labelledby="import-tab-{selected}">
    {#if selected === 'text'}
      <TextImport {...props} />
    {/if}
  </div>
</section>

<style>
  [role='tablist'] {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
    padding: var(--space-1);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }

  [role='tab'] {
    border-color: transparent;
    background: transparent;
  }

  [role='tab'][aria-selected='true'] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--on-ink);
  }
</style>
