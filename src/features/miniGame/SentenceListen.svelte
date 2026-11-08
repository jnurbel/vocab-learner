<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Card, Language } from '../../domain/card';
  import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
  import { splitAroundTerm, type SentenceListenQuestion } from '../../domain/game/sentenceListen';
  import { slowRateOf } from '../../domain/speechRate';
  import type { Outcome } from '../../domain/srs/reviewState';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import Pinyin from '../../ui/Pinyin.svelte';
  import RewardsPanel from '../game/RewardsPanel.svelte';
  import type { RewardsSummary } from '../game/sessionRewards';
  import { isOwnKeyTarget, isShortcut } from './gameKeys';
  import type { MiniGameSelection, MiniGameSummary } from './miniGameRecorder';
  import type { SentenceListenSession } from './sentenceListenSession';

  interface Props {
    /** Every word: the game keeps those of the language that have an example. */
    cards: readonly Card[];
    language: Language;
    /** Words imposed by a step session of the path; every eligible word otherwise. */
    cardIds?: readonly string[];
    speaker: Speaker;
    /** The rate of the voice chosen in the settings: the slow replay reads at half of it. */
    speechRate: number;
    startSession: (selection: MiniGameSelection) => Promise<SentenceListenSession>;
    /** Called once a round with at least one answer ends. */
    onSessionEnd: () => void;
    /** Back to the list of mini-games, when there is one. */
    onExit?: () => void;
  }

  const {
    cards,
    language,
    cardIds,
    speaker,
    speechRate,
    startSession,
    onSessionEnd,
    onExit,
  }: Props = $props();

  interface Feedback {
    outcome: Outcome;
    question: SentenceListenQuestion;
    chosen: Card | 'unknown';
  }

  type Screen =
    | { kind: 'intro' }
    | { kind: 'starting' }
    | { kind: 'notEligible' }
    | { kind: 'playing' }
    | { kind: 'summary'; summary: MiniGameSummary };

  /** The gap left in a written sentence, as wide as a word. */
  const GAP: Record<Language, string> = { zh: '＿＿', en: '_____' };

  let view = $state<Screen>({ kind: 'intro' });
  let error = $state<'startFailed' | 'saveFailed' | undefined>();
  let session: SentenceListenSession | undefined;
  let question = $state.raw<SentenceListenQuestion>();
  let position = $state(0);
  let total = $state(0);
  let voice = $state<'available' | 'missing' | 'failed'>('available');
  let feedback = $state.raw<Feedback>();
  let busy = $state(false);
  let rewards = $state.raw<RewardsSummary>();
  let optionsElement = $state<HTMLElement>();
  let advanceTimer: ReturnType<typeof setTimeout> | undefined;

  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');
  const written = $derived(voice !== 'available');

  onDestroy(() => {
    clearTimeout(advanceTimer);
    speaker.cancel();
  });

  async function start() {
    // Phones only let speech start inside the tap: unlock it before any await.
    speaker.unlock();
    error = undefined;
    view = { kind: 'starting' };
    try {
      voice = (await speaker.hasVoice(language)) ? 'available' : 'missing';
      session = await startSession({
        cards,
        language,
        labelIds: [],
        ...(cardIds === undefined ? {} : { cardIds }),
      });
    } catch {
      error = 'startFailed';
      view = { kind: 'intro' };
      return;
    }
    if (!session.eligible) {
      view = { kind: 'notEligible' };
      return;
    }
    view = { kind: 'playing' };
    await showCurrent();
  }

  async function showCurrent() {
    if (session === undefined) {
      return;
    }
    question = session.current;
    position = session.position;
    total = session.total;
    feedback = undefined;
    if (question === undefined) {
      finish();
      return;
    }
    await tick();
    optionsElement?.focus();
    const asked = session;
    if (written) {
      asked.heard();
    } else {
      // The time to answer starts once the sentence was heard to its end.
      void play().then(() => {
        asked.heard();
      });
    }
  }

  function play(slow = false): Promise<void> {
    const asked = feedback?.question ?? question;
    if (asked === undefined || voice !== 'available') {
      return Promise.resolve();
    }
    speaker.unlock();
    return speaker
      .speak(
        asked.sentence,
        asked.target.language,
        slow ? { rate: slowRateOf(speechRate) } : undefined,
      )
      .catch(() => {
        voice = 'failed';
      });
  }

  async function choose(choice: Card | 'unknown') {
    if (session === undefined || question === undefined || feedback !== undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    const asked = question;
    try {
      const { outcome } = await session.answer(choice, { hintsUsed: 0 });
      feedback = { outcome, question: asked, chosen: choice };
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    if (feedback.outcome === 'wrong') {
      void play();
    } else {
      advanceTimer = setTimeout(() => void next(), MINI_GAME_CONFIG.feedbackCorrectMs);
    }
    await tick();
    document.getElementById('sentence-listen-continue')?.focus();
  }

  async function next() {
    clearTimeout(advanceTimer);
    if (feedback === undefined) {
      return;
    }
    await showCurrent();
  }

  function finish() {
    speaker.cancel();
    if (session === undefined) {
      return;
    }
    const summary = session.summary();
    rewards = session.rewards();
    view = { kind: 'summary', summary };
    if (summary.answered > 0) {
      onSessionEnd();
    }
  }

  async function quit() {
    clearTimeout(advanceTimer);
    await session?.quit();
    finish();
  }

  function onKeydown(event: KeyboardEvent) {
    if (view.kind !== 'playing' || isShortcut(event)) {
      return;
    }
    if (feedback !== undefined) {
      if (event.key === 'Enter' && !isOwnKeyTarget(event.target, event.key)) {
        event.preventDefault();
        void next();
      }
      return;
    }
    if (question === undefined || isOwnKeyTarget(event.target, event.key)) {
      return;
    }
    const key = event.key.toLowerCase();
    const chosen = question.options[Number(event.key) - 1];
    if (key === ' ' || key === 'r') {
      event.preventDefault();
      void play();
    } else if (key === 'l') {
      void play(true);
    } else if (event.key === '0') {
      void choose('unknown');
    } else if (/^[1-9]$/.test(event.key) && chosen !== undefined) {
      void choose(chosen);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section aria-labelledby="sentence-listen-title" class="sentence-listen">
  <h2 id="sentence-listen-title">{fr.sentenceListen.title}</h2>

  {#if error !== undefined}
    <p role="alert" class="error">{fr.sentenceListen[error]}</p>
  {/if}

  {#if view.kind === 'intro' || view.kind === 'starting'}
    <p>{fr.sentenceListen.intro}</p>
    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={view.kind === 'starting'}
        onclick={() => void start()}>{fr.sentenceListen.start}</button
      >
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{fr.sentenceListen.back}</button>
      {/if}
    </div>
    {#if view.kind === 'starting'}
      <p>{fr.sentenceListen.starting}</p>
    {/if}
  {:else if view.kind === 'notEligible'}
    <p>{fr.sentenceListen.notEligible}</p>
    {#if onExit !== undefined}
      <button type="button" onclick={onExit}>{fr.sentenceListen.back}</button>
    {/if}
  {:else if view.kind === 'playing' && question !== undefined}
    {@const target = question.target}
    {@const parts = splitAroundTerm(question.sentence, target)}
    <div class="toolbar">
      <p class="progress">
        {format(fr.sentenceListen.progress, { position: position + 1, total })}
      </p>
      <button type="button" onclick={() => void quit()}>{fr.sentenceListen.quit}</button>
    </div>

    <div class="stage-card">
      {#if written}
        <p class="notice">
          {voice === 'failed' ? fr.sentenceListen.audioError : fr.sentenceListen.noVoice}
        </p>
        {#if feedback === undefined && parts !== undefined}
          <p class="sentence" lang={lang(target.language)}>
            {parts.before}{GAP[target.language]}{parts.after}
          </p>
        {/if}
      {:else}
        <button
          type="button"
          class="speaker"
          aria-keyshortcuts="R Space"
          aria-label={fr.sentenceListen.replay}
          onclick={() => void play()}
        >
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            <path class="wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
          </svg>
        </button>
      {/if}
      <p class="prompt">{written ? fr.sentenceListen.promptWritten : fr.sentenceListen.prompt}</p>
      <p class="help">{fr.sentenceListen.keysHelp}</p>
    </div>

    <div
      class="options"
      role="group"
      aria-label={fr.sentenceListen.optionsLabel}
      tabindex="-1"
      bind:this={optionsElement}
    >
      {#each question.options as option, index (option.id)}
        {@const isTarget = option.id === target.id}
        {@const isChosen = feedback?.chosen !== 'unknown' && feedback?.chosen.id === option.id}
        <button
          type="button"
          class="option"
          class:right={feedback !== undefined && isTarget}
          class:wrong={feedback !== undefined && isChosen && !isTarget}
          aria-keyshortcuts={String(index + 1)}
          disabled={feedback !== undefined || busy}
          onclick={() => void choose(option)}
        >
          <kbd aria-hidden="true">{index + 1}</kbd>
          <span lang={lang(option.language)}>{option.term}</span>
          {#if feedback !== undefined && isTarget}
            <span class="mark" aria-hidden="true">✓</span>
          {:else if feedback !== undefined && isChosen}
            <span class="mark" aria-hidden="true">✗</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if feedback === undefined}
      <div class="actions">
        {#if !written}
          <button type="button" aria-keyshortcuts="L" onclick={() => void play(true)}
            ><kbd aria-hidden="true">L</kbd> {fr.sentenceListen.slow}</button
          >
        {/if}
        <button
          type="button"
          class="unknown"
          aria-keyshortcuts="0"
          disabled={busy}
          onclick={() => void choose('unknown')}
          ><kbd aria-hidden="true">0</kbd> {fr.sentenceListen.unknown}</button
        >
      </div>
    {:else}
      {@const heard = feedback.question.target}
      {@const shown = splitAroundTerm(feedback.question.sentence, heard)}
      <div
        role="status"
        aria-live="polite"
        class="feedback"
        class:feedback-right={feedback.outcome !== 'wrong'}
        class:feedback-wrong={feedback.outcome === 'wrong'}
      >
        <p class="verdict">
          <span aria-hidden="true">{feedback.outcome === 'wrong' ? '✗' : '✓'}</span>
          {feedback.outcome === 'wrong'
            ? format(fr.sentenceListen.wrong, { term: heard.term })
            : fr.sentenceListen.right}
        </p>
        {#if shown !== undefined}
          <p class="sentence" lang={lang(heard.language)}>
            {shown.before}<mark>{shown.term}</mark>{shown.after}
          </p>
        {/if}
        <p class="word">
          <span lang={lang(heard.language)}>{heard.term}</span>
          {#if heard.pinyin !== undefined}
            · <span lang="zh-CN"><Pinyin pinyin={heard.pinyin} /></span>
          {/if}
          · <span>{heard.translation}</span>
        </p>
        {#if feedback.outcome === 'wrong'}
          <p>
            {feedback.chosen === 'unknown'
              ? fr.sentenceListen.unknownChosen
              : format(fr.sentenceListen.chose, { term: feedback.chosen.term })}
          </p>
        {/if}
      </div>
      <div class="actions">
        <button
          type="button"
          id="sentence-listen-continue"
          class="primary"
          onclick={() => void next()}>{fr.sentenceListen.continue}</button
        >
      </div>
    {/if}
  {:else if view.kind === 'summary'}
    <h3>{fr.sentenceListen.summaryTitle}</h3>
    <p class="score">
      {format(fr.sentenceListen.score, {
        correct: view.summary.correct,
        total: view.summary.answered,
      })}
    </p>
    {#if rewards !== undefined}
      <RewardsPanel {rewards} />
    {/if}
    <div class="actions">
      <button type="button" class="primary" onclick={() => void start()}
        >{fr.sentenceListen.again}</button
      >
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{fr.sentenceListen.back}</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .toolbar,
  .actions {
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
    font-weight: var(--weight-heavy);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .stage-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    padding: var(--space-5) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-raised);
    text-align: center;
  }

  .stage-card p {
    margin: 0;
  }

  .speaker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 88px;
    height: 88px;
    border: 0;
    border-radius: 50%;
    background: var(--jade);
    color: var(--on-jade);
  }

  .speaker svg {
    fill: currentColor;
  }

  .speaker .wave {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .prompt {
    font-size: var(--text-lg);
    font-weight: var(--weight-heavy);
  }

  .sentence {
    font-size: var(--text-xl);
    line-height: 1.5;
  }

  .sentence[lang='zh-CN'] {
    font-family: var(--font-hanzi);
    font-size: var(--text-2xl);
  }

  mark {
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--jade-soft);
    color: var(--jade-strong);
    font-weight: var(--weight-heavy);
  }

  .options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .option {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    justify-content: flex-start;
    min-height: var(--target-lg);
    padding: var(--space-2) var(--space-4);
    border: 2px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    text-align: left;
    transition: border-color 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .option:disabled {
    opacity: 1;
    cursor: default;
  }

  .option kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-soft);
    font-size: var(--text-sm);
  }

  .option.right {
    border-color: var(--jade);
    background: var(--jade-soft);
    color: var(--jade-strong);
  }

  .option.wrong {
    border-color: var(--ochre);
    background: var(--ochre-soft);
  }

  .mark {
    margin-left: auto;
    font-weight: var(--weight-heavy);
  }

  .word {
    margin: 0;
    font-size: var(--text-lg);
  }

  .help,
  .notice {
    color: var(--ink-soft);
    font-size: var(--text-sm);
  }

  .score {
    font-size: var(--text-lg);
    font-weight: var(--weight-heavy);
  }

  @media (prefers-reduced-motion: reduce) {
    .option {
      transition: none;
    }
  }
</style>
