<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../domain/card';
  import type { Label } from '../domain/label';
  import WordList from '../features/cards/WordList.svelte';
  import BulkEntry from '../features/import/BulkEntry.svelte';
  import type { BulkEntrySave } from '../features/import/bulkEntrySave';
  import fr from '../i18n/fr.json';
  import { loadPinyinGenerator } from '../services/pinyinLoader';
  import { VocabularyRepository } from '../storage/vocabularyRepository';

  interface Props {
    /** One database per profile; profiles come later, so a single default one for now. */
    databaseName?: string;
  }

  const { databaseName = 'vocab-learner-default' }: Props = $props();

  let repository: VocabularyRepository | undefined;
  let cards = $state<Card[]>([]);
  let labels = $state<Label[]>([]);

  async function reload(from: VocabularyRepository) {
    [cards, labels] = await Promise.all([from.allCards(), from.allLabels()]);
  }

  onMount(() => {
    repository = new VocabularyRepository(databaseName);
    void reload(repository);
  });

  async function save({ newLabel, changes }: BulkEntrySave) {
    if (repository === undefined) {
      throw new Error('Storage is not ready');
    }
    await repository.saveImport(changes, newLabel);
    await reload(repository);
  }
</script>

<main>
  <h1>{fr.app.title}</h1>
  <p>{fr.app.tagline}</p>

  <BulkEntry
    existingCards={cards}
    existingLabels={labels}
    loadPinyin={loadPinyinGenerator}
    newId={() => crypto.randomUUID()}
    clock={() => new Date().toISOString()}
    onSave={save}
  />

  <WordList {cards} {labels} />
</main>

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
</style>
