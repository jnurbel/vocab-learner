<script lang="ts">
  import { onMount } from 'svelte';
  import { shouldRemindBackup } from '../domain/backup/backupReminder';
  import { sha256With } from '../domain/backup/sha256';
  import type { Card } from '../domain/card';
  import type { Label } from '../domain/label';
  import type { LabelChanges } from '../domain/labelOperations';
  import type { ReviewStateRecord } from '../domain/progressRecords';
  import { studyDay } from '../domain/srs/studyDay';
  import BackupPanel from '../features/backup/BackupPanel.svelte';
  import WordForm from '../features/cards/WordForm.svelte';
  import WordList from '../features/cards/WordList.svelte';
  import Flashcards from '../features/flashcards/Flashcards.svelte';
  import {
    startFlashcardSession,
    type FlashcardSelection,
    type FlashcardStore,
  } from '../features/flashcards/flashcardSession';
  import BulkEntry from '../features/import/BulkEntry.svelte';
  import { startPracticeSession, type PracticeStore } from '../features/practice/practiceSession';
  import LabelManager from '../features/labels/LabelManager.svelte';
  import { labelMastery, wordProgress } from '../features/progress/wordProgress';
  import type { VocabularySave } from '../features/vocabularySave';
  import fr from '../i18n/fr.json';
  import { BackupService, type BackupFile } from '../services/backup/backupService';
  import {
    DirectoryBackup,
    directoryPickerOf,
    type AutoBackupStatus,
    type DirectoryHandleLike,
  } from '../services/backup/directoryBackup';
  import { browserDownloadEnvironment, downloadFile } from '../services/backup/downloadFile';
  import { loadPinyinGenerator } from '../services/pinyinLoader';
  import { persistenceRequester } from '../services/storagePersistence';
  import { browserSpeechHost, createWebSpeechSpeaker, type Speaker } from '../services/tts/speaker';
  import { BackupMetaStore } from '../storage/backupMetaStore';
  import { BackupRepository } from '../storage/backupRepository';
  import { StudyRepository } from '../storage/studyRepository';
  import { VocabularyRepository } from '../storage/vocabularyRepository';
  import { appVersion } from './appVersion';
  import { srs } from './srs';

  interface Props {
    /** One database per profile; profiles come later, so a single default one for now. */
    databaseName?: string;
    /** Asks the browser to keep the data; called after every successful save. */
    requestPersistence?: () => Promise<void>;
    /** Reads the words aloud; the browser's voices by default. */
    speaker?: Speaker;
    /** Saves a backup file on this device; the browser's download by default. */
    download?: (file: BackupFile) => void;
    /** Picks the automatic backup folder; absent where the browser has no folder access. */
    directoryPicker?: (() => Promise<DirectoryHandleLike>) | undefined;
    now?: () => Date;
  }

  const {
    databaseName = 'vocab-learner-default',
    requestPersistence = persistenceRequester(
      'storage' in navigator ? navigator.storage : undefined,
    ),
    speaker = createWebSpeechSpeaker(browserSpeechHost()),
    download = (file: BackupFile) => {
      downloadFile(file, browserDownloadEnvironment());
    },
    directoryPicker = directoryPickerOf(window as Parameters<typeof directoryPickerOf>[0]),
    now = () => new Date(),
  }: Props = $props();

  /** Profiles come later: the pseudonym written into the backup file names. */
  const PROFILE_NAME = 'profil';

  type Page = 'words' | 'flashcards' | 'backup';
  const PAGES: readonly Page[] = ['words', 'flashcards', 'backup'];
  let page = $state<Page>('words');

  let repository: VocabularyRepository | undefined;
  let study: StudyRepository | undefined;
  let meta: BackupMetaStore<DirectoryHandleLike> | undefined;
  let backupService = $state.raw<BackupService>();
  let directory = $state.raw<DirectoryBackup>();
  // Raw state: the data read from storage is replaced as a whole, never mutated, and must stay
  // plain objects, because IndexedDB cannot clone the proxies of deep reactive state.
  let cards = $state.raw<Card[]>([]);
  let labels = $state.raw<Label[]>([]);
  /** The word open in the edit form, if any. */
  let editing = $state.raw<Card>();
  let reviewStates = $state.raw<ReviewStateRecord[]>([]);
  let lastBackupAt = $state<string>();
  let remindBackup = $state(false);
  let reminderHidden = $state(false);
  let autoBackupStatus = $state<AutoBackupStatus>();

  const stateByCardId = $derived(new Map(reviewStates.map((state) => [state.cardId, state])));
  /** Taken again on each reload: a page left open overnight would show yesterday's thirst. */
  let moment = $state.raw(currentMoment());

  function currentMoment() {
    const at = now();
    return { now: at, today: studyDay(at, undefined, srs) };
  }
  const progressOf = (card: Card) => wordProgress(stateByCardId.get(card.id), moment, srs);
  const masteryOf = (label: Label) => labelMastery(label.id, cards, reviewStates, srs.config);

  const newId = () => crypto.randomUUID();
  const clock = () => now().toISOString();

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
    meta = new BackupMetaStore<DirectoryHandleLike>(databaseName);
    backupService = new BackupService({
      repository: new BackupRepository(databaseName),
      sha256: sha256With(crypto.subtle),
      clock: now,
      newId,
      appVersion,
      profileName: PROFILE_NAME,
    });
    directory = new DirectoryBackup({ store: meta, picker: directoryPicker, clock: now });
    void reload(repository);
    void refreshBackupState();
  });

  function ready<T>(service: T | undefined): T {
    if (service === undefined) {
      throw new Error('Storage is not ready');
    }
    return service;
  }

  const storage = () => ready(repository);

  async function refreshBackupState() {
    const store = ready(meta);
    lastBackupAt = await store.lastBackupAt();
    remindBackup = shouldRemindBackup(lastBackupAt, await store.lastChangeAt(), now());
  }

  /** Anything worth backing up changed: the backup reminder depends on it. */
  async function recordChange() {
    await ready(meta).recordChange(clock());
    await refreshBackupState();
  }

  /** Every answer is a change to back up. */
  const flashcardStore: FlashcardStore = {
    load: (since) => ready(study).load(since),
    startSession: (session) => ready(study).startSession(session),
    recordAnswer: async (answer) => {
      await ready(study).recordAnswer(answer);
      await recordChange();
    },
    endSession: (sessionId, endedAt) => ready(study).endSession(sessionId, endedAt),
  };

  function startSession(selection: FlashcardSelection) {
    return startFlashcardSession(selection, { store: flashcardStore, srs, clock: now, newId });
  }

  /** Free practice answers are history to back up too, though they change no review. */
  const practiceStore: PracticeStore = {
    startSession: (session) => ready(study).startSession(session),
    recordPracticeAnswer: async (answer) => {
      await ready(study).recordPracticeAnswer(answer);
      await recordChange();
    },
    endSession: (sessionId, endedAt) => ready(study).endSession(sessionId, endedAt),
  };

  function startPractice(selection: FlashcardSelection) {
    return startPracticeSession(selection, { store: practiceStore, clock: now, newId });
  }

  async function sessionEnded() {
    await reload(storage());
    await writeAutomaticBackup();
  }

  /** After each session, into the chosen folder, if any; never prompts. */
  async function writeAutomaticBackup() {
    if (!directory?.isSupported()) {
      return;
    }
    try {
      autoBackupStatus = await directory.writeBackup(await ready(backupService).createBackupFile());
    } catch {
      autoBackupStatus = 'failed';
    }
    await refreshBackupState();
  }

  /** Runs on a click only: the browser shows its permission request on a user gesture. */
  async function reauthorizeFolder() {
    if (directory !== undefined && (await directory.reauthorize())) {
      await writeAutomaticBackup();
    }
  }

  async function backedUp() {
    await ready(meta).recordBackup(clock());
    await refreshBackupState();
  }

  async function restored() {
    await recordChange();
    await reload(storage());
  }

  async function save({ newLabel, changes }: VocabularySave) {
    const store = storage();
    await store.saveImport(changes, newLabel);
    void requestPersistence();
    await recordChange();
    await reload(store);
  }

  async function changeLabels(changes: LabelChanges) {
    const store = storage();
    await store.applyLabelChanges(changes);
    await recordChange();
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
    await recordChange();
    await reload(store);
  }
</script>

<main>
  <h1>{fr.app.title}</h1>
  <p>{fr.app.tagline}</p>

  {#if remindBackup && !reminderHidden && page !== 'backup'}
    <aside class="banner" aria-label={fr.backup.title}>
      <p>{fr.backup.reminder}</p>
      <button
        type="button"
        onclick={() => {
          page = 'backup';
        }}>{fr.backup.reminderAction}</button
      >
      <button
        type="button"
        onclick={() => {
          reminderHidden = true;
        }}>{fr.backup.reminderDismiss}</button
      >
    </aside>
  {/if}
  {#if autoBackupStatus === 'permissionNeeded' && page !== 'backup'}
    <aside class="banner" aria-label={fr.backup.folderTitle}>
      <p>{fr.backup.permissionNeeded}</p>
      <button type="button" onclick={reauthorizeFolder}>{fr.backup.reauthorize}</button>
    </aside>
  {/if}

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

  {#if page === 'backup' && backupService !== undefined}
    <BackupPanel
      service={backupService}
      {download}
      {lastBackupAt}
      onBackedUp={backedUp}
      onRestored={restored}
      folder={directory?.isSupported() === true ? directory : undefined}
      {autoBackupStatus}
      onReauthorized={writeAutomaticBackup}
    />
  {:else if page === 'flashcards'}
    <Flashcards
      {cards}
      {labels}
      {startSession}
      {startPractice}
      {speaker}
      onSessionEnd={() => void sessionEnded()}
    />
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
  .banner {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    border: 1px solid currentColor;
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    margin-bottom: 1rem;
  }

  .banner p {
    flex: 1 1 100%;
    margin: 0;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  nav button,
  .banner button {
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
