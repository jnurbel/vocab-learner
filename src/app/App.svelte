<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../domain/card';
  import type { Label } from '../domain/label';
  import type { LabelChanges } from '../domain/labelOperations';
  import WordForm from '../features/cards/WordForm.svelte';
  import WordList from '../features/cards/WordList.svelte';
  import BulkEntry from '../features/import/BulkEntry.svelte';
  import LabelManager from '../features/labels/LabelManager.svelte';
  import type { VocabularySave } from '../features/vocabularySave';
  import fr from '../i18n/fr.json';
  import { loadPinyinGenerator } from '../services/pinyinLoader';
  import { persistenceRequester } from '../services/storagePersistence';
  import { VocabularyRepository } from '../storage/vocabularyRepository';

  interface Props {
    /** One database per profile; profiles come later, so a single default one for now. */
    databaseName?: string;
    /** Asks the browser to keep the data; called after every successful save. */
    requestPersistence?: () => Promise<void>;
  }

  const {
    databaseName = 'vocab-learner-default',
    requestPersistence = persistenceRequester(
      'storage' in navigator ? navigator.storage : undefined,
    ),
  }: Props = $props();

  let repository: VocabularyRepository | undefined;
  let cards = $state<Card[]>([]);
  let labels = $state<Label[]>([]);
  /** The word open in the edit form, if any. */
  let editing = $state<Card>();

  async function reload(from: VocabularyRepository) {
    [cards, labels] = await Promise.all([from.allCards(), from.allLabels()]);
  }

  onMount(() => {
    repository = new VocabularyRepository(databaseName);
    void reload(repository);
  });

  const newId = () => crypto.randomUUID();
  const clock = () => new Date().toISOString();

  function storage(): VocabularyRepository {
    if (repository === undefined) {
      throw new Error('Storage is not ready');
    }
    return repository;
  }

  async function save({ newLabel, changes }: VocabularySave) {
    const store = storage();
    await store.saveImport(changes, newLabel);
    void requestPersistence();
    await reload(store);
  }

  async function changeLabels(changes: LabelChanges) {
    const store = storage();
    await store.applyLabelChanges(changes);
    await reload(store);
  }

  function startEditing(card: Card) {
    editing = card;
  }

  async function deleteCard(card: Card) {
    const store = storage();
    await store.deleteCard(card.id);
    if (editing?.id === card.id) {
      editing = undefined;
    }
    await reload(store);
  }
</script>

<main>
  <h1>{fr.app.title}</h1>
  <p>{fr.app.tagline}</p>

  <WordForm
    idPrefix="word-entry"
    existingCards={cards}
    existingLabels={labels}
    loadPinyin={loadPinyinGenerator}
    {newId}
    {clock}
    onSave={save}
  />

  <BulkEntry
    existingCards={cards}
    existingLabels={labels}
    loadPinyin={loadPinyinGenerator}
    {newId}
    {clock}
    onSave={save}
  />

  {#if editing !== undefined}
    {#key editing.id}
      <WordForm
        idPrefix="word-edit"
        card={editing}
        existingCards={cards}
        existingLabels={labels}
        loadPinyin={loadPinyinGenerator}
        {newId}
        {clock}
        onSave={save}
        onClose={() => {
          editing = undefined;
        }}
      />
    {/key}
  {/if}

  <WordList {cards} {labels} onEdit={startEditing} onDelete={deleteCard} />

  <LabelManager {labels} {cards} {clock} onChange={changeLabels} />
</main>

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
</style>
