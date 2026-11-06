<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../domain/card';
  import type { Label } from '../domain/label';
  import type { LabelChanges } from '../domain/labelOperations';
  import WordForm from '../features/cards/WordForm.svelte';
  import WordList from '../features/cards/WordList.svelte';
  import BulkEntry from '../features/import/BulkEntry.svelte';
  import LabelManager from '../features/labels/LabelManager.svelte';
  import Flashcards from '../features/flashcards/Flashcards.svelte';
  import {
    startFlashcardSession,
    type FlashcardSelection,
  } from '../features/flashcards/flashcardSession';
  import type { VocabularySave } from '../features/vocabularySave';
  import fr from '../i18n/fr.json';
  import { loadPinyinGenerator } from '../services/pinyinLoader';
  import { persistenceRequester } from '../services/storagePersistence';
  import { browserSpeechHost, createWebSpeechSpeaker, type Speaker } from '../services/tts/speaker';
  import { StudyRepository } from '../storage/studyRepository';
  import { srs } from './srs';
  import type { ReviewStateRecord } from '../domain/progressRecords';
  import { studyDay } from '../domain/srs/studyDay';
  import { labelMastery, wordProgress } from '../features/progress/wordProgress';
  import { VocabularyRepository } from '../storage/vocabularyRepository';

  interface Props {
    /** One database per profile; profiles come later, so a single default one for now. */
    databaseName?: string;
    /** Asks the browser to keep the data; called after every successful save. */
    requestPersistence?: () => Promise<void>;
    /** Reads the words aloud; the browser's voices by default. */
    speaker?: Speaker;
  }

  const {
    databaseName = 'vocab-learner-default',
    requestPersistence = persistenceRequester(
      'storage' in navigator ? navigator.storage : undefined,
    ),
    speaker = createWebSpeechSpeaker(browserSpeechHost()),
  }: Props = $props();

  type Page = 'words' | 'flashcards';
  const PAGES: readonly Page[] = ['words', 'flashcards'];
  let page = $state<Page>('words');

  let repository: VocabularyRepository | undefined;
  let study: StudyRepository | undefined;
  // Raw state: the data read from storage is replaced as a whole, never mutated, and must stay
  // plain objects, because IndexedDB cannot clone the proxies of deep reactive state.
  let cards = $state.raw<Card[]>([]);
  let labels = $state.raw<Label[]>([]);
  /** The word open in the edit form, if any. */
  let editing = $state.raw<Card>();
  let reviewStates = $state.raw<ReviewStateRecord[]>([]);

  const stateByCardId = $derived(new Map(reviewStates.map((state) => [state.cardId, state])));
  /** Taken again on each reload: a page left open overnight would show yesterday's thirst. */
  let moment = $state.raw(currentMoment());

  function currentMoment() {
    const now = new Date();
    return { now, today: studyDay(now, undefined, srs) };
  }
  const progressOf = (card: Card) => wordProgress(stateByCardId.get(card.id), moment, srs);
  const masteryOf = (label: Label) => labelMastery(label.id, cards, reviewStates, srs.config);

  async function reload(from: VocabularyRepository) {
    [cards, labels, reviewStates] = await Promise.all([
      from.allCards(),
      from.allLabels(),
      study?.reviewStates() ?? [],
    ]);
    moment = currentMoment();
  }

  onMount(() => {
    repository = new VocabularyRepository(databaseName);
    study = new StudyRepository(databaseName);
    void reload(repository);
  });

  const newId = () => crypto.randomUUID();

  function startSession(selection: FlashcardSelection) {
    if (study === undefined) {
      throw new Error('Storage is not ready');
    }
    return startFlashcardSession(selection, { store: study, srs, clock: () => new Date(), newId });
  }

  function sessionEnded() {
    void reload(storage());
  }
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

  <nav aria-label={fr.nav.label}>
    {#each PAGES as name (name)}
      <button
        type="button"
        aria-current={page === name ? 'page' : undefined}
        onclick={() => {
          page = name;
        }}>{fr.nav[name]}</button
      >
    {/each}
  </nav>

  {#if page === 'flashcards'}
    <Flashcards {cards} {labels} {startSession} {speaker} onSessionEnd={sessionEnded} />
  {:else}
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

    <WordList {cards} {labels} {progressOf} onEdit={startEditing} onDelete={deleteCard} />

    <LabelManager {labels} {cards} {clock} {masteryOf} onChange={changeLabels} />
  {/if}
</main>

<style>
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  nav button {
    min-height: 44px;
  }

  nav button[aria-current='page'] {
    font-weight: bold;
    text-decoration: underline;
  }

  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
</style>
