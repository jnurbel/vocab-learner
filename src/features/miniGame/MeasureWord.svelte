<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Card } from '../../domain/card';
  import { groupsOf, type MeasureWordQuestion } from '../../domain/game/measureWord';
  import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
  import type { Outcome } from '../../domain/srs/reviewState';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import Pinyin from '../../ui/Pinyin.svelte';
  import RewardsPanel from '../game/RewardsPanel.svelte';
  import type { RewardsSummary } from '../game/sessionRewards';
  import { isOwnKeyTarget, isShortcut } from './gameKeys';
  import type { MeasureWordSession } from './measureWordSession';
  import type { MiniGameSelection, MiniGameSummary } from './miniGameRecorder';

  interface Props {
    /** Every word: the game keeps the Chinese nouns of the table of measure words. */
    cards: readonly Card[];
    /** Words imposed by a step session of the path; every eligible noun otherwise. */
    cardIds?: readonly string[];
    speaker: Speaker;
    speechRate: number;
    startSession: (selection: MiniGameSelection) => Promise<MeasureWordSession>;
    onSessionEnd: () => void;
    onExit?: () => void;
  }

  const { cards, cardIds, speaker, speechRate, startSession, onSessionEnd, onExit }: Props =
    $props();

  interface Feedback {
    outcome: Outcome;
    question: MeasureWordQuestion;
    chosen: string;
  }

  type Screen =
    | { kind: 'intro' }
    | { kind: 'starting' }
    | { kind: 'notEligible' }
    | { kind: 'playing' }
    | { kind: 'summary'; summary: MiniGameSummary };

  const texts = fr.measureWord;
  let view = $state<Screen>({ kind: 'intro' });
  let error = $state<'startFailed' | 'saveFailed' | undefined>();
  let session: MeasureWordSession | undefined;
  let question = $state.raw<MeasureWordQuestion>();
  let position = $state(0);
  let total = $state(0);
  let feedback = $state.raw<Feedback>();
  let busy = $state(false);
  let voice = $state(false);
  let rewards = $state.raw<RewardsSummary>();
  let optionsElement = $state<HTMLElement>();
  let advanceTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    clearTimeout(advanceTimer);
    speaker.cancel();
  });

  async function start() {
    speaker.unlock();
    error = undefined;
    view = { kind: 'starting' };
    try {
      voice = await speaker.hasVoice('zh');
      session = await startSession({
        cards,
        language: 'zh',
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
  }

  /** The right measure word shown among the options. */
  function shownRight(asked: MeasureWordQuestion): string {
    return asked.options.find((option) => asked.right.includes(option)) ?? '';
  }

  /** 一个信封 is read once the answer is given (GAME_DESIGN.md 6.11). */
  function play(): void {
    const asked = feedback?.question;
    if (asked === undefined || !voice) {
      return;
    }
    speaker.unlock();
    speaker
      .speak(`${asked.determiner}${shownRight(asked)}${asked.target.term}`, 'zh', {
        rate: speechRate,
      })
      .catch(() => {
        voice = false;
      });
  }

  async function choose(choice: string) {
    if (session === undefined || question === undefined || feedback !== undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    const asked = question;
    try {
      const outcome = await session.answer(choice);
      feedback = { outcome, question: asked, chosen: choice };
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    play();
    if (feedback.outcome === 'correct') {
      advanceTimer = setTimeout(() => void next(), MINI_GAME_CONFIG.feedbackCorrectMs);
    }
    await tick();
    document.getElementById('measure-word-continue')?.focus();
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

  /** What a measure word is for, from its first group of meaning. */
  function purposeOf(measureWord: string): string | undefined {
    const [group] = groupsOf(measureWord);
    return group === undefined ? undefined : format(texts.groups[group], { word: measureWord });
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
    const chosen = question.options[Number(event.key) - 1];
    if (event.key === '0') {
      void choose('unknown');
    } else if (/^[1-9]$/.test(event.key) && chosen !== undefined) {
      void choose(chosen);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section aria-labelledby="measure-word-title" class="measure-word">
  <h2 id="measure-word-title">{texts.title}</h2>

  {#if error !== undefined}
    <p role="alert" class="error">{texts[error]}</p>
  {/if}

  {#if view.kind === 'intro' || view.kind === 'starting'}
    <p>{texts.intro}</p>
    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={view.kind === 'starting'}
        onclick={() => void start()}>{texts.start}</button
      >
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{texts.back}</button>
      {/if}
    </div>
    {#if view.kind === 'starting'}
      <p role="status">{texts.starting}</p>
    {/if}
  {:else if view.kind === 'notEligible'}
    <p>{texts.notEligible}</p>
    {#if onExit !== undefined}
      <button type="button" onclick={onExit}>{texts.back}</button>
    {/if}
  {:else if view.kind === 'playing' && question !== undefined}
    {@const noun = question.target}
    <div class="toolbar">
      <p class="progress">{format(texts.progress, { position: position + 1, total })}</p>
      <button type="button" onclick={() => void quit()}>{texts.quit}</button>
    </div>

    <div class="stage-card">
      <p class="phrase" lang="zh-CN">
        {question.determiner}<span class="gap" role="img" aria-label={texts.gap}
          >{feedback === undefined ? '＿' : shownRight(question)}</span
        >{noun.term}
      </p>
      <p class="noun">
        {#if noun.pinyin !== undefined}
          <span lang="zh-CN"><Pinyin pinyin={noun.pinyin} /></span> ·
        {/if}
        <span>{noun.translation}</span>
      </p>
      <p class="help">{texts.keysHelp}</p>
    </div>

    <div
      class="options"
      role="group"
      aria-label={texts.optionsLabel}
      tabindex="-1"
      bind:this={optionsElement}
    >
      {#each question.options as option, index (option)}
        {@const isRight = question.right.includes(option)}
        {@const isChosen = feedback?.chosen === option}
        <button
          type="button"
          class="option"
          class:right={feedback !== undefined && isRight}
          class:wrong={feedback !== undefined && isChosen && !isRight}
          aria-keyshortcuts={String(index + 1)}
          disabled={feedback !== undefined || busy}
          onclick={() => void choose(option)}
        >
          <kbd aria-hidden="true">{index + 1}</kbd>
          <span lang="zh-CN">{option}</span>
          {#if feedback !== undefined && isRight}
            <span class="mark" aria-hidden="true">✓</span>
          {:else if feedback !== undefined && isChosen}
            <span class="mark" aria-hidden="true">✗</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if feedback === undefined}
      <div class="actions">
        <button
          type="button"
          class="unknown"
          aria-keyshortcuts="0"
          disabled={busy}
          onclick={() => void choose('unknown')}
          ><kbd aria-hidden="true">0</kbd> {texts.unknown}</button
        >
      </div>
    {:else}
      {@const asked = feedback.question}
      {@const right = shownRight(asked)}
      <div
        role="status"
        aria-live="polite"
        class="feedback"
        class:feedback-right={feedback.outcome === 'correct'}
        class:feedback-wrong={feedback.outcome !== 'correct'}
      >
        <p class="verdict">
          <span aria-hidden="true">{feedback.outcome === 'correct' ? '✓' : '✗'}</span>
          {feedback.outcome === 'correct' ? texts.right : texts.wrong}
          <span lang="zh-CN">{asked.determiner}{right}{asked.target.term}</span>
        </p>
        <p>
          {format(texts.allRight, { term: asked.target.term, list: asked.right.join(' · ') })}
        </p>
        {#if feedback.outcome !== 'correct'}
          {#if feedback.chosen === 'unknown'}
            <p>{texts.unknownChosen}</p>
          {:else if purposeOf(feedback.chosen) !== undefined}
            <p>{purposeOf(feedback.chosen)}</p>
          {/if}
          {#if purposeOf(right) !== undefined}
            <p>{purposeOf(right)}</p>
          {/if}
        {/if}
      </div>
      <div class="actions">
        {#if voice}
          <button type="button" onclick={play}>{texts.listen}</button>
        {/if}
        <button type="button" id="measure-word-continue" class="primary" onclick={() => void next()}
          >{texts.continue}</button
        >
      </div>
    {/if}
  {:else if view.kind === 'summary'}
    <h3>{texts.summaryTitle}</h3>
    <p class="score">
      {format(texts.score, { correct: view.summary.correct, total: view.summary.answered })}
    </p>
    {#if rewards !== undefined}
      <RewardsPanel {rewards} />
    {/if}
    <div class="actions">
      <button type="button" class="primary" onclick={() => void start()}>{texts.again}</button>
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{texts.back}</button>
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

  .phrase {
    font-family: var(--font-hanzi);
    font-size: var(--text-2xl);
  }

  .gap {
    display: inline-block;
    min-width: 1.5em;
    margin: 0 var(--space-1);
    border-bottom: 2px solid var(--jade);
    color: var(--jade-strong);
  }

  .noun {
    font-size: var(--text-lg);
  }

  .options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
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
    font-family: var(--font-hanzi);
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
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
    font-family: var(--font-sans, inherit);
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

  .help {
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
