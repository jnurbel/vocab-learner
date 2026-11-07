<script lang="ts">
  import { onMount } from 'svelte';
  import { shouldRemindBackup } from '../domain/backup/backupReminder';
  import { sha256With } from '../domain/backup/sha256';
  import type { Card } from '../domain/card';
  import type { Label } from '../domain/label';
  import type { LabelChanges } from '../domain/labelOperations';
  import type { ProgressRecord, ReviewStateRecord } from '../domain/progressRecords';
  import { studyDay } from '../domain/srs/studyDay';
  import BackupPanel from '../features/backup/BackupPanel.svelte';
  import WordForm from '../features/cards/WordForm.svelte';
  import WordList from '../features/cards/WordList.svelte';
  import Dictation from '../features/dictation/Dictation.svelte';
  import {
    startDictationSession,
    type DictationSelection,
  } from '../features/dictation/dictationSession';
  import Flashcards from '../features/flashcards/Flashcards.svelte';
  import Garden from '../features/garden/Garden.svelte';
  import ListenMeaning from '../features/miniGame/ListenMeaning.svelte';
  import {
    startListenMeaningSession,
    type ListenMeaningSelection,
  } from '../features/miniGame/listenMeaningSession';
  import {
    loadStudyOutlook,
    startFlashcardSession,
    type FlashcardSelection,
    type FlashcardStore,
  } from '../features/flashcards/flashcardSession';
  import BulkEntry from '../features/import/BulkEntry.svelte';
  import { startPracticeSession, type PracticeStore } from '../features/practice/practiceSession';
  import LabelManager from '../features/labels/LabelManager.svelte';
  import VoicePanel from '../features/settings/VoicePanel.svelte';
  import SettingsPanel from '../features/settings/SettingsPanel.svelte';
  import { SPEECH_RATES, speechSpeedOf, type SpeechSpeed } from '../domain/speechRate';
  import { answerModeOf, newPerDayOf, type AnswerMode } from '../domain/studySettings';
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
  import {
    browserSpeechHost,
    createWebSpeechSpeaker,
    type Speaker,
    type VoiceCatalog,
  } from '../services/tts/speaker';
  import { BackupMetaStore } from '../storage/backupMetaStore';
  import { BackupRepository } from '../storage/backupRepository';
  import { StudyRepository } from '../storage/studyRepository';
  import { VocabularyRepository } from '../storage/vocabularyRepository';
  import { appVersion } from './appVersion';
  import NavIcon from '../ui/NavIcon.svelte';
  import { srs } from './srs';
  import { EXAM_CONFIG } from '../domain/exam/examConfig';
  import { undoAutoUnfocus, unfocusPastExams } from '../domain/labelFocus';
  import type { Language } from '../domain/card';
  import Home from '../features/home/Home.svelte';
  import { loadHomeView } from '../features/home/homeSession';
  import type { FlashcardLaunch } from '../features/flashcards/flashcardSession';

  interface Props {
    /** One database per profile; profiles come later, so a single default one for now. */
    databaseName?: string;
    /** Asks the browser to keep the data; called after every successful save. */
    requestPersistence?: () => Promise<void>;
    /** Reads the words aloud; the browser's voices by default. */
    speaker?: Speaker;
    /** Lists the voices in the settings; the browser's by default. */
    voices?: VoiceCatalog;
    /** Saves a backup file on this device; the browser's download by default. */
    download?: (file: BackupFile) => void;
    /** Picks the automatic backup folder; absent where the browser has no folder access. */
    directoryPicker?: (() => Promise<DirectoryHandleLike>) | undefined;
    now?: () => Date;
  }

  /** The browser's voices, shared by the readings and the voice list of the settings. */
  const browserSpeech = createWebSpeechSpeaker(browserSpeechHost());

  const {
    databaseName = 'vocab-learner-default',
    requestPersistence = persistenceRequester(
      'storage' in navigator ? navigator.storage : undefined,
    ),
    speaker = browserSpeech,
    voices = browserSpeech,
    download = (file: BackupFile) => {
      downloadFile(file, browserDownloadEnvironment());
    },
    directoryPicker = directoryPickerOf(window as Parameters<typeof directoryPickerOf>[0]),
    now = () => new Date(),
  }: Props = $props();

  /** Profiles come later: the pseudonym written into the backup file names. */
  const PROFILE_NAME = 'profil';

  type MenuPage = 'home' | 'words' | 'garden' | 'flashcards' | 'dictation' | 'backup' | 'settings';
  /** 'miniGame' is opened from the garden or the flashcards, not from the menu. */
  type Page = MenuPage | 'miniGame';
  const PAGES: readonly MenuPage[] = [
    'home',
    'words',
    'garden',
    'flashcards',
    'dictation',
    'backup',
    'settings',
  ];
  let page = $state<Page>('home');
  /** A session asked for from the home screen, started as soon as the flashcards open. */
  let flashcardLaunch = $state.raw<FlashcardLaunch>();
  /** The home waits for the first read of the storage. */
  let loaded = $state(false);

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
  /** The game progress (points, level, streak), read again with the words. */
  let progress = $state.raw<ProgressRecord>();
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
    progress = (await study?.load(clock()))?.progress;
    loaded = true;
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
    void unpinPastExams(repository).then(() => reload(ready(repository)));
    void refreshBackupState();
  });

  /** The day after a test, its label is unpinned (GAME_DESIGN.md 2.6); the home offers the undo. */
  async function unpinPastExams(from: VocabularyRepository) {
    const { today } = currentMoment();
    const unpinned = unfocusPastExams(await from.allLabels(), { today, now: clock() }, EXAM_CONFIG);
    if (unpinned.length > 0) {
      await from.saveLabels(unpinned);
      await recordChange();
    }
  }

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
    reviseAnswer: async (answer) => {
      await ready(study).reviseAnswer(answer);
      await recordChange();
    },
    endSession: (sessionId, endedAt) => ready(study).endSession(sessionId, endedAt),
    recordProgress: async (update) => {
      await ready(study).recordProgress(update);
      await recordChange();
    },
  };

  function startSession(selection: FlashcardSelection) {
    return startFlashcardSession(
      { ...selection, labels },
      { store: flashcardStore, srs, clock: now, newId },
    );
  }

  /** The same store as the flashcards: every answer is a change to back up. */
  function startDictation(selection: DictationSelection) {
    return startDictationSession(selection, { store: flashcardStore, srs, clock: now, newId });
  }

  /** The same store as the flashcards: every answer is a change to back up. */
  function startMiniGame(selection: ListenMeaningSelection) {
    return startListenMeaningSession(selection, { store: flashcardStore, srs, clock: now, newId });
  }

  function openMiniGame() {
    page = 'miniGame';
  }

  /** Typing suits a computer; on a touch screen, writing on paper is the default. */
  const dictationMode =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
      ? 'paper'
      : 'keyboard';

  /** Free practice answers are history to back up too, though they change no review. */
  const practiceStore: PracticeStore = {
    startSession: (session) => ready(study).startSession(session),
    recordPracticeAnswer: async (answer) => {
      await ready(study).recordPracticeAnswer(answer);
      await recordChange();
    },
    revisePracticeAnswer: async (answer) => {
      await ready(study).revisePracticeAnswer(answer);
      await recordChange();
    },
    endSession: (sessionId, endedAt) => ready(study).endSession(sessionId, endedAt),
  };

  function loadOutlook(selection: FlashcardSelection) {
    return loadStudyOutlook({ ...selection, labels }, { store: flashcardStore, srs, clock: now });
  }

  function startPractice(selection: FlashcardSelection) {
    return startPracticeSession(selection, { store: practiceStore, clock: now, newId });
  }

  /** The daily quota of new words, read when the settings open. */
  let newPerDay = $state<number>();

  $effect(() => {
    if (page === 'settings') {
      void loadNewPerDay();
    }
  });

  async function loadNewPerDay() {
    newPerDay = newPerDayOf((await ready(study).load(clock())).settings);
  }

  /** Applies from the next session on; a setting is worth backing up too. */
  async function changeNewPerDay(chosen: number) {
    await ready(study).saveNewPerDay(chosen);
    newPerDay = chosen;
    await recordChange();
  }

  /** The speed of the voice, read at start: every reading uses it. */
  let voiceSpeed = $state<SpeechSpeed>();

  onMount(() => {
    void loadVoiceSpeed();
  });

  async function loadVoiceSpeed() {
    let loaded: SpeechSpeed;
    try {
      loaded = speechSpeedOf((await ready(study).load(clock())).settings);
    } catch {
      loaded = speechSpeedOf(undefined);
    }
    speaker.setRate(SPEECH_RATES[loaded]);
    voiceSpeed = loaded;
  }

  /** Applies at once; a setting is worth backing up too. */
  async function changeVoiceSpeed(chosen: SpeechSpeed) {
    await ready(study).saveTtsRate(SPEECH_RATES[chosen]);
    speaker.setRate(SPEECH_RATES[chosen]);
    voiceSpeed = chosen;
    await recordChange();
  }

  /** How the flashcards are answered, read when they open. */
  let answerMode = $state<AnswerMode>();

  $effect(() => {
    if (page === 'flashcards') {
      void loadAnswerMode();
    }
  });

  async function loadAnswerMode() {
    answerMode = answerModeOf((await ready(study).load(clock())).settings);
  }

  /** A setting is worth backing up too. */
  async function changeAnswerMode(chosen: AnswerMode) {
    await ready(study).saveAnswerMode(chosen);
    answerMode = chosen;
    await recordChange();
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

  function loadHome(language: Language) {
    return loadHomeView({ cards, labels, language }, { store: flashcardStore, srs, clock: now });
  }

  function launchFlashcards(launch: FlashcardLaunch) {
    flashcardLaunch = launch;
    page = 'flashcards';
  }

  function startFromHome(language: Language) {
    launchFlashcards({ mode: 'review', language, labelIds: [] });
  }

  function practiseFromHome(language: Language, labelIds: readonly string[]) {
    launchFlashcards({ mode: 'practice', language, labelIds });
  }

  /** "Annuler le désépinglage": the label comes back pinned. */
  async function undoUnpin(label: Label) {
    const undone = undoAutoUnfocus(labels, label.id, clock());
    if (!undone.ok) {
      return;
    }
    const store = storage();
    await store.saveLabels(undone.value.filter(({ id }) => id === label.id));
    await recordChange();
    await reload(store);
  }

  async function changeIntensive(label: Label, intensive: boolean) {
    await ready(study).saveIntensiveExamMode(label.id, intensive);
    await recordChange();
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

<div class="shell">
  <div class="sidebar">
    <header class="brand">
      <span class="logo" lang="zh-CN" aria-hidden="true">词</span>
      <h1>{fr.app.title}</h1>
    </header>

    <nav aria-label={fr.nav.label} class="menu">
      {#each PAGES as name (name)}
        <button
          type="button"
          aria-current={page === name ? 'page' : undefined}
          onclick={() => {
            flashcardLaunch = undefined;
            page = name;
          }}><NavIcon {name} /><span class="menu-text">{fr.nav[name]}</span></button
        >
      {/each}
    </nav>
  </div>

  <main>
    <p class="tagline">{fr.app.tagline}</p>

    {#if remindBackup && !reminderHidden && page !== 'backup'}
      <aside class="banner" aria-label={fr.backup.title}>
        <p>{fr.backup.reminder}</p>
        <button
          type="button"
          class="primary"
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
        <button type="button" class="primary" onclick={reauthorizeFolder}
          >{fr.backup.reauthorize}</button
        >
      </aside>
    {/if}

    <div class="content">
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
      {:else if page === 'settings'}
        {#if newPerDay !== undefined}
          <SettingsPanel {newPerDay} onNewPerDayChange={changeNewPerDay} />
        {/if}
        {#if voiceSpeed !== undefined}
          <VoicePanel {speaker} {voices} speed={voiceSpeed} onSpeedChange={changeVoiceSpeed} />
        {/if}
      {:else if page === 'garden'}
        <Garden
          {cards}
          {labels}
          {reviewStates}
          {moment}
          {srs}
          {progress}
          onWater={() => {
            page = 'flashcards';
          }}
          onMiniGame={openMiniGame}
        />
      {:else if page === 'miniGame'}
        <ListenMeaning
          {cards}
          {speaker}
          startSession={startMiniGame}
          onSessionEnd={() => void sessionEnded()}
        />
      {:else if page === 'flashcards'}
        {#if answerMode !== undefined}
          <Flashcards
            {cards}
            {labels}
            {startSession}
            {startPractice}
            {loadOutlook}
            {speaker}
            loadPinyin={loadPinyinGenerator}
            {answerMode}
            onAnswerModeChange={changeAnswerMode}
            onMiniGame={openMiniGame}
            onSessionEnd={() => void sessionEnded()}
            {...flashcardLaunch === undefined ? {} : { startWith: flashcardLaunch }}
          />
        {/if}
      {:else if page === 'home'}
        {#if loaded}
          <Home
            loadView={loadHome}
            {speaker}
            onStart={startFromHome}
            onPractice={practiseFromHome}
            onAddWords={() => {
              page = 'words';
            }}
            onUndoUnpin={undoUnpin}
            onIntensiveChange={changeIntensive}
          />
        {/if}
      {:else if page === 'dictation' && voiceSpeed !== undefined}
        <Dictation
          {cards}
          {labels}
          {speaker}
          startSession={startDictation}
          loadPinyin={loadPinyinGenerator}
          defaultMode={dictationMode}
          defaultSpeed={voiceSpeed}
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

        <LabelManager
          {labels}
          {cards}
          {clock}
          {masteryOf}
          today={moment.today}
          onChange={changeLabels}
        />
      {/if}
    </div>
  </main>
</div>

<style>
  /* Phone first: a top bar with the name, the menu as a bar at the bottom of the screen. */
  .shell {
    min-height: 100vh;
    min-height: 100dvh;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-4) 0;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    background: var(--jade);
    color: var(--on-jade);
    font-weight: var(--weight-heavy);
    font-size: var(--text-lg);
  }

  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-heavy);
    letter-spacing: -0.01em;
  }

  .menu {
    position: fixed;
    inset: auto 0 0;
    z-index: 10;
    display: grid;
    /* One equal column per menu entry, whatever their number. */
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 2px;
    padding: var(--space-1) var(--space-2) calc(var(--space-2) + env(safe-area-inset-bottom));
    background: var(--surface);
    border-top: 1px solid var(--line);
  }

  .menu button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    min-height: var(--target-lg);
    padding: var(--space-1) 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }

  .menu-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu button:hover {
    color: var(--ink);
  }

  .menu button[aria-current='page'] {
    color: var(--jade-strong);
    background: var(--jade-soft);
    font-weight: var(--weight-heavy);
  }

  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: var(--content-width);
    margin: 0 auto;
    padding: var(--space-2) var(--space-4)
      calc(var(--bottom-bar-height) + var(--space-6) + env(safe-area-inset-bottom));
  }

  .tagline {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  /* Each screen is made of cards on the paper background. */
  .content > :global(section),
  .content > :global(form) {
    min-width: 0;
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
  }

  .banner {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-3) var(--space-4);
    background: var(--thirst-soft);
    color: var(--ink);
    border: 1px solid var(--line);
    border-left: 4px solid var(--thirst);
    border-radius: var(--radius-md);
  }

  .banner p {
    flex: 1 1 100%;
    margin: 0;
    font-weight: var(--weight-bold);
  }

  /* Computer: a menu down the left side, as in docs/ui/mockups/Main.dc.html. */
  @media (min-width: 900px) {
    .shell {
      display: grid;
      grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
      /* The sidebar colour runs down the whole page, however long the screen. */
      background: linear-gradient(
        to right,
        var(--surface) calc(var(--sidebar-width) - 1px),
        var(--line) calc(var(--sidebar-width) - 1px) var(--sidebar-width),
        transparent var(--sidebar-width)
      );
    }

    .sidebar {
      position: sticky;
      top: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      height: 100vh;
      height: 100dvh;
      padding: var(--space-6) var(--space-5);
      box-sizing: border-box;
      overflow-y: auto;
      background: var(--surface);
      border-right: 1px solid var(--line);
    }

    .brand {
      padding: 0;
    }

    .menu {
      position: static;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: 0;
      border: 0;
    }

    .menu button {
      flex-direction: row;
      justify-content: flex-start;
      gap: var(--space-3);
      min-height: var(--target);
      padding: var(--space-2) var(--space-3);
      color: var(--ink-soft);
      font-size: var(--text-md);
      text-align: left;
    }

    main {
      gap: var(--space-5);
      width: 100%;
      box-sizing: border-box;
      padding: var(--space-6) var(--space-7);
    }

    .tagline {
      font-size: var(--text-md);
    }

    .content {
      gap: var(--space-5);
    }

    .content > :global(section),
    .content > :global(form) {
      padding: var(--space-5) var(--space-6);
    }
  }
</style>
