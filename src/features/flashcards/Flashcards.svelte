<script lang="ts">
  import { tick } from 'svelte';
  import { answerExerciseFor } from '../../domain/answerExercise';
  import type { Card, Language } from '../../domain/card';
  import type { Label } from '../../domain/label';
  import type { PinyinGenerator } from '../../domain/pinyinGeneration';
  import type { Outcome } from '../../domain/srs/reviewState';
  import { ANSWER_MODES, DEFAULT_ANSWER_MODE, type AnswerMode } from '../../domain/studySettings';
  import type { ReviewQueueItem } from '../../domain/srs/reviewQueue';
  import { format, formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import Pinyin from '../../ui/Pinyin.svelte';
  import {
    PracticeSession,
    type PracticeItem,
    type PracticeSummary,
  } from '../practice/practiceSession';
  import type {
    FlashcardSelection,
    FlashcardSession,
    SelfEvaluation,
    SessionSummary,
    StudyOutlookView,
  } from './flashcardSession';
  import StudyOutlookPanel from './StudyOutlookPanel.svelte';
  import RewardsPanel from '../game/RewardsPanel.svelte';
  import type { RewardsSummary } from '../game/sessionRewards';
  import TypedAnswer from './TypedAnswer.svelte';

  interface Props {
    cards: readonly Card[];
    labels: readonly Label[];
    startSession: (selection: FlashcardSelection) => Promise<FlashcardSession>;
    /** Free practice: every chosen word, without any effect on the planning. */
    startPractice: (selection: FlashcardSelection) => PracticeSession;
    /** Explains today's queue of the selection, and what comes next. */
    loadOutlook: (selection: FlashcardSelection) => Promise<StudyOutlookView>;
    speaker: Speaker;
    /** pinyin-pro is large: loaded only to explain a wrong answer typed in hanzi. */
    loadPinyin: () => Promise<PinyinGenerator>;
    /** How the learner chose to answer last time. */
    answerMode?: AnswerMode;
    /** Remembers a new way of answering, when a session starts with it. */
    onAnswerModeChange?: (mode: AnswerMode) => Promise<void>;
    /** Called once a session with at least one answer ends, finished or left. */
    onSessionEnd: () => void;
    /** Opens the ListenMeaning mini-game, when the app offers it. */
    onMiniGame?: () => void;
  }

  const {
    cards,
    labels,
    startSession,
    startPractice,
    loadOutlook,
    speaker,
    loadPinyin,
    answerMode = DEFAULT_ANSWER_MODE,
    onAnswerModeChange = () => Promise.resolve(),
    onSessionEnd,
    onMiniGame,
  }: Props = $props();

  const LANGUAGES: readonly Language[] = ['zh', 'en'];
  /** Keys 1, 2, 3 rate the card once turned over. */
  const RATED_BY_KEY: Readonly<Record<string, SelfEvaluation>> = {
    1: 'again',
    2: 'hard',
    3: 'good',
  };
  const EVALUATIONS: readonly { evaluation: SelfEvaluation; key: string }[] = [
    { evaluation: 'again', key: '1' },
    { evaluation: 'hard', key: '2' },
    { evaluation: 'good', key: '3' },
  ];

  let language = $state<Language>('zh');
  let labelIds = $state<string[]>([]);
  // svelte-ignore state_referenced_locally
  let chosenMode = $state<AnswerMode>(answerMode);
  /** The choice remembered so far, to save a new one only. */
  // svelte-ignore state_referenced_locally
  let rememberedMode = answerMode;
  /** The way of answering of the session under way. */
  let runMode = $state<AnswerMode>(DEFAULT_ANSWER_MODE);
  /** The id of the session under way, which seeds the mixed mode. */
  let sessionSeed = $state('');

  type Screen =
    | { kind: 'setup' }
    | { kind: 'starting' }
    | { kind: 'studying' }
    | { kind: 'summary'; summary: SessionSummary; left: boolean; answered: number }
    | { kind: 'practiceSummary'; summary: PracticeSummary; left: boolean; answered: number };
  let view = $state<Screen>({ kind: 'setup' });
  let error = $state<'startFailed' | 'saveFailed' | undefined>();

  let session: FlashcardSession | PracticeSession | undefined;
  /** 'practice': free practice, whose answers change no review. */
  let mode = $state<'review' | 'practice'>('review');
  // Raw state: the queue items are replaced, never mutated.
  let item = $state.raw<ReviewQueueItem | PracticeItem>();
  let position = $state(0);
  let total = $state(0);
  let flipped = $state(false);
  let pinyinShown = $state(false);
  let voice = $state<'available' | 'missing' | 'failed'>('available');
  let busy = $state(false);
  let cardElement = $state<HTMLElement>();

  let outlook = $state.raw<StudyOutlookView>();
  /** What the session that just ended brought to the game. */
  let rewards = $state.raw<RewardsSummary>();
  /** Words still thirsty after a review session, offered as a bonus. */
  let thirstyLeft = $state(0);
  /** Only the latest request is shown, should an earlier one answer late. */
  let outlookRequest = 0;
  const outlookShown = $derived(
    view.kind === 'setup' || (view.kind === 'summary' && view.answered === 0 && !view.left),
  );

  $effect(() => {
    if (!outlookShown) {
      return;
    }
    const request = (outlookRequest += 1);
    loadOutlook({ cards, language, labelIds: [...labelIds] }).then(
      (loaded) => {
        if (request === outlookRequest) {
          outlook = loaded;
        }
      },
      () => {
        // The outlook only explains: without it, the session still works.
        outlook = undefined;
      },
    );
  });

  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');
  const showWord = $derived(voice !== 'available' || flipped);
  /** How the current card is answered; the session id seeds the mixed mode. */
  const exercise = $derived(answerExerciseFor(runMode, sessionSeed, position));
  const modeLabel = (mode: AnswerMode) => {
    const label = fr.flashcards.answerModes[mode];
    return typeof label === 'string' ? label : label[language];
  };

  async function start() {
    await open('review', () => startSession({ cards, language, labelIds: [...labelIds] }));
  }

  async function practise(
    selection: FlashcardSelection = { cards, language, labelIds: [...labelIds] },
  ) {
    await open('practice', () => Promise.resolve(startPractice(selection)));
  }

  /** Practises again on the given words only, whatever their labels. */
  async function practiseAgain(words: readonly Card[]) {
    await practise({ cards: words, language, labelIds: [] });
  }

  async function open(
    opened: typeof mode,
    begin: () => Promise<FlashcardSession | PracticeSession>,
  ) {
    error = undefined;
    mode = opened;
    view = { kind: 'starting' };
    runMode = chosenMode;
    await rememberMode(chosenMode);
    try {
      const started = await begin();
      voice = (await speaker.hasVoice(language)) ? 'available' : 'missing';
      session = started;
      sessionSeed = started.id;
    } catch {
      error = 'startFailed';
      view = { kind: 'setup' };
      return;
    }
    if (session.finished) {
      view = summaryScreen(session, false);
      return;
    }
    view = { kind: 'studying' };
    await showCurrent();
  }

  /** Remembering the choice is a comfort: the session starts even if it fails. */
  async function rememberMode(chosen: AnswerMode) {
    if (chosen === rememberedMode) {
      return;
    }
    try {
      await onAnswerModeChange(chosen);
      rememberedMode = chosen;
    } catch {
      // Asked again at the next session.
    }
  }

  async function showCurrent() {
    if (session === undefined) {
      return;
    }
    item = session.current;
    position = session.position;
    total = session.total;
    flipped = false;
    pinyinShown = false;
    await tick();
    cardElement?.focus();
    // Typing the word: hearing it first would give the answer away.
    if (exercise !== 'typeWord') {
      play();
    }
  }

  function play() {
    if (item === undefined || voice !== 'available') {
      return;
    }
    speaker.speak(item.card.term, item.card.language).catch(() => {
      voice = 'failed';
    });
  }

  async function answerTyped(outcome: Outcome, details: { hintsUsed: number; answer?: string }) {
    if (session === undefined || exercise === 'selfAssess') {
      return;
    }
    await session.answerTyped(exercise, outcome, details);
  }

  async function acceptTyped() {
    await session?.acceptLastAnswer();
  }

  async function nextCard() {
    if (session?.finished === true) {
      finish(false);
    } else {
      await showCurrent();
    }
  }

  async function flip() {
    flipped = true;
    await tick();
    cardElement?.focus();
  }

  async function rate(evaluation: SelfEvaluation) {
    if (session === undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    const options = { hintsUsed: pinyinShown ? 1 : 0 };
    try {
      if (session instanceof PracticeSession) {
        // "Je le connais déjà" is offered for a new word only, never in free practice.
        if (evaluation !== 'known') {
          await session.answer(evaluation, options);
        }
      } else {
        await session.answer(evaluation, options);
      }
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    if (session.finished) {
      finish(false);
    } else {
      await showCurrent();
    }
  }

  function finish(left: boolean) {
    if (session === undefined) {
      return;
    }
    speaker.cancel();
    const ended = summaryScreen(session, left);
    view = ended;
    rewards = session.rewards();
    void loadThirstyLeft(session instanceof PracticeSession || ended.answered === 0);
    if (ended.answered > 0) {
      onSessionEnd();
    }
  }

  function summaryScreen(
    ended: FlashcardSession | PracticeSession,
    left: boolean,
  ): Extract<Screen, { answered: number }> {
    if (ended instanceof PracticeSession) {
      const summary = ended.summary();
      return { kind: 'practiceSummary', summary, left, answered: summary.seen };
    }
    const summary = ended.summary();
    return { kind: 'summary', summary, left, answered: summary.reviewed + summary.introduced };
  }

  /** The bonus offer of the summary: the words of the selection still due today. */
  async function loadThirstyLeft(skip: boolean) {
    thirstyLeft = 0;
    if (skip) {
      return;
    }
    try {
      thirstyLeft = (await loadOutlook({ cards, language, labelIds: [...labelIds] })).dueToday;
    } catch {
      // The offer is a comfort: without it, the summary still shows.
    }
  }

  async function quit() {
    if (session === undefined) {
      return;
    }
    await session.quit();
    finish(true);
  }

  function restart() {
    session = undefined;
    item = undefined;
    view = { kind: 'setup' };
  }

  /** Fields and controls keep their own keys: Space activates a focused button. */
  function isOwnKeyTarget(target: EventTarget | null, key: string): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.closest('input, textarea, select, [contenteditable="true"]') !== null) {
      return true;
    }
    return key === ' ' && target.closest('button, a') !== null;
  }

  function onKeydown(event: KeyboardEvent) {
    if (
      view.kind !== 'studying' ||
      exercise !== 'selfAssess' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isOwnKeyTarget(event.target, event.key)
    ) {
      return;
    }
    const evaluation = RATED_BY_KEY[event.key];
    if (event.key === ' ' && !flipped) {
      event.preventDefault();
      void flip();
    } else if (event.key.toLowerCase() === 'r') {
      play();
    } else if (evaluation !== undefined && flipped) {
      void rate(evaluation);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section aria-labelledby="flashcards-title" class="flashcards">
  <h2 id="flashcards-title">{fr.flashcards.title}</h2>

  {#if error !== undefined}
    <p role="alert" class="error">{fr.flashcards[error]}</p>
  {/if}

  {#if view.kind === 'setup' || view.kind === 'starting'}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      {#if outlook !== undefined}
        <StudyOutlookPanel {outlook} />
      {/if}
      <fieldset>
        <legend>{fr.flashcards.languageLegend}</legend>
        {#each LANGUAGES as code (code)}
          <label class="choice">
            <input type="radio" name="flashcards-language" value={code} bind:group={language} />
            {fr.languages[code]}
          </label>
        {/each}
      </fieldset>
      {#if labels.length > 0}
        <fieldset>
          <legend>{fr.flashcards.labelsLegend}</legend>
          {#each labels as label (label.id)}
            <label class="choice">
              <input type="checkbox" value={label.id} bind:group={labelIds} />
              {label.name}
            </label>
          {/each}
        </fieldset>
      {/if}
      <fieldset>
        <legend>{fr.flashcards.answerModeLegend}</legend>
        {#each ANSWER_MODES as option (option)}
          <label class="choice">
            <input
              type="radio"
              name="flashcards-answer-mode"
              value={option}
              bind:group={chosenMode}
            />
            {modeLabel(option)}
          </label>
        {/each}
      </fieldset>
      <div class="actions">
        <button type="submit" disabled={view.kind === 'starting'}>{fr.flashcards.start}</button>
        <button type="button" disabled={view.kind === 'starting'} onclick={() => practise()}
          >{fr.practice.start}</button
        >
        {#if onMiniGame !== undefined}
          <button type="button" disabled={view.kind === 'starting'} onclick={onMiniGame}
            >{fr.garden.miniGame}</button
          >
        {/if}
      </div>
      {#if view.kind === 'starting'}
        <p>{fr.flashcards.starting}</p>
      {/if}
    </form>
  {:else if view.kind === 'studying' && item !== undefined}
    {#if mode === 'practice'}
      <p class="practice-banner">{fr.practice.banner}</p>
    {/if}
    <div class="toolbar">
      <p class="progress" aria-hidden="true">
        {format(fr.flashcards.progress, { position: position + 1, total })}
      </p>
      <button type="button" onclick={quit}>{fr.flashcards.quit}</button>
    </div>
    <p role="status" class="visually-hidden">
      {format(fr.flashcards.progressLabel, { position: position + 1, total })}
    </p>

    {#if exercise !== 'selfAssess'}
      {#key `${item.card.id}-${String(position)}`}
        <TypedAnswer
          card={item.card}
          {exercise}
          canReplay={voice === 'available'}
          onReplay={play}
          {loadPinyin}
          onAnswer={answerTyped}
          onAccept={acceptTyped}
          onContinue={() => void nextCard()}
        />
      {/key}
    {:else}
      {#if voice === 'missing'}
        <p class="notice">{fr.flashcards.noVoice[item.card.language]}</p>
      {:else if voice === 'failed'}
        <p class="notice">{fr.flashcards.audioError}</p>
      {/if}

      {#key item.card.id}
        <div class="card" tabindex="-1" bind:this={cardElement}>
          {#if showWord}
            <p class="term" lang={lang(item.card.language)}>{item.card.term}</p>
          {/if}
          {#if !flipped}
            <p>{voice === 'available' ? fr.flashcards.listenPrompt : fr.flashcards.readPrompt}</p>
            {#if pinyinShown && item.card.pinyin !== undefined}
              <p lang="zh-CN"><Pinyin pinyin={item.card.pinyin} /></p>
              <p class="hint">{fr.flashcards.hintUsed}</p>
            {/if}
          {:else}
            <div class="back">
              {#if item.card.pinyin !== undefined}
                <p lang="zh-CN"><Pinyin pinyin={item.card.pinyin} /></p>
              {/if}
              <p class="translation">{item.card.translation}</p>
              {#if item.card.example !== undefined}
                <p>
                  {fr.flashcards.example}
                  <span lang={lang(item.card.language)}>{item.card.example}</span>
                </p>
              {/if}
            </div>
          {/if}
        </div>
      {/key}

      <div class="actions">
        {#if voice === 'available'}
          <button type="button" aria-keyshortcuts="R" onclick={play}
            ><kbd aria-hidden="true">R</kbd> {fr.flashcards.replay}</button
          >
        {/if}
        {#if !flipped}
          {#if item.card.pinyin !== undefined && !pinyinShown}
            <button
              type="button"
              onclick={() => {
                pinyinShown = true;
              }}>{fr.flashcards.showPinyin}</button
            >
          {/if}
          <button type="button" class="dark" aria-keyshortcuts="Space" onclick={flip}
            ><kbd aria-hidden="true">Espace</kbd> {fr.flashcards.flip}</button
          >
        {/if}
      </div>

      {#if flipped}
        <fieldset class="evaluation">
          <legend>{fr.flashcards.evaluationLegend}</legend>
          {#each EVALUATIONS as { evaluation, key } (evaluation)}
            <button
              type="button"
              class="rate rate-{evaluation}"
              aria-keyshortcuts={key}
              disabled={busy}
              onclick={() => rate(evaluation)}
              ><kbd aria-hidden="true">{key}</kbd> {fr.flashcards.evaluations[evaluation]}</button
            >
          {/each}
          {#if item.kind === 'new'}
            <button
              type="button"
              class="rate rate-known"
              disabled={busy}
              onclick={() => rate('known')}>{fr.flashcards.evaluations.known}</button
            >
          {/if}
        </fieldset>
      {/if}
      <p class="help">{fr.flashcards.keyboardHelp}</p>
    {/if}
  {:else if view.kind === 'summary'}
    {#if view.answered === 0 && !view.left}
      <p>{fr.flashcards.nothingDue}</p>
      {#if outlook !== undefined}
        <StudyOutlookPanel {outlook} />
      {/if}
    {:else}
      <h3>{fr.flashcards.summaryTitle}</h3>
      {#if view.left}
        <p>{format(fr.flashcards.quitSummary, { count: view.answered })}</p>
      {/if}
      <ul>
        <li>{format(fr.flashcards.reviewed, { count: view.summary.reviewed })}</li>
        <li>{format(fr.flashcards.introduced, { count: view.summary.introduced })}</li>
      </ul>
      {#if rewards !== undefined}
        <RewardsPanel {rewards} {thirstyLeft} onContinue={() => void start()} />
      {/if}
      {#if view.summary.stageChanges.length > 0}
        <h4 id="flashcards-stage-changes">{fr.flashcards.stageChangesTitle}</h4>
        <ul aria-labelledby="flashcards-stage-changes">
          {#each view.summary.stageChanges as change (change.card.id)}
            <li>
              <span lang={lang(change.card.language)}>{change.card.term}</span> :
              {format(fr.flashcards.stageChange, {
                from: fr.stages[change.from],
                to: fr.stages[change.to],
              })}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
    {@const nothingDue = view.answered === 0 && !view.left}
    <div class="actions">
      <button type="button" class={{ primary: nothingDue }} onclick={() => practise()}
        >{fr.practice.start}</button
      >
      <button type="button" onclick={restart}>{fr.flashcards.restart}</button>
    </div>
  {:else if view.kind === 'practiceSummary'}
    {#if view.answered === 0 && !view.left}
      <p>{fr.practice.empty}</p>
    {:else}
      <h3>{fr.practice.summaryTitle}</h3>
      <ul>
        <li>{formatCount(fr.practice.seen, view.summary.seen)}</li>
        <li>{format(fr.practice.known, { count: view.summary.known })}</li>
        <li>{format(fr.practice.toReview, { count: view.summary.toReview.length })}</li>
      </ul>
      {#if rewards !== undefined}
        <RewardsPanel {rewards} />
      {/if}
      {#if view.summary.toReview.length > 0}
        {@const toReview = view.summary.toReview}
        <button type="button" class="primary" onclick={() => practiseAgain(toReview)}
          >{fr.practice.retry}</button
        >
      {/if}
    {/if}
    <button type="button" class="restart" onclick={restart}>{fr.flashcards.restart}</button>
  {/if}
</section>

<style>
  fieldset {
    margin: 0 0 var(--space-4);
  }

  .toolbar,
  .actions,
  .evaluation {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .toolbar {
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .progress {
    margin: 0;
    color: var(--jade);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    font-weight: var(--weight-heavy);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* The card itself: raised on the section, the word large and centred. */
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 14rem;
    margin: 0 0 var(--space-4);
    padding: var(--space-6) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-raised);
    text-align: center;
    animation: appear var(--duration) ease-out;
  }

  .card p {
    margin: 0;
  }

  .term {
    font-size: var(--text-hanzi);
    line-height: 1.2;
  }

  .back {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--line);
    animation: appear var(--duration) ease-out;
  }

  .translation {
    font-size: var(--text-xl);
    font-weight: var(--weight-heavy);
  }

  /* Rating buttons keep their text and shortcut; the tint is only a second cue. */
  .evaluation {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    margin-top: var(--space-4);
  }

  .rate {
    min-height: var(--target-lg);
    color: var(--ink);
  }

  .rate-again {
    background: var(--ochre-soft);
  }

  .rate-hard {
    background: var(--thirst-soft);
  }

  .rate-good {
    background: var(--jade-soft);
  }

  .rate-known {
    background: var(--info-soft);
  }

  .practice-banner {
    padding: var(--space-3) var(--space-4);
    border-left: 4px solid var(--jade);
    border-radius: var(--radius-md);
    background: var(--jade-soft);
    color: var(--jade-strong);
    font-weight: var(--weight-heavy);
  }

  .restart {
    margin-top: var(--space-3);
  }

  .notice,
  .hint,
  .help {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .help {
    margin-top: var(--space-4);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .back {
      animation: none;
    }
  }
</style>
