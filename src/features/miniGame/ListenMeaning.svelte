<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Card, Language } from '../../domain/card';
  import type { ListenMeaningQuestion } from '../../domain/game/listenMeaning';
  import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
  import type { Outcome } from '../../domain/srs/reviewState';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import Pinyin from '../../ui/Pinyin.svelte';
  import RewardsPanel from '../game/RewardsPanel.svelte';
  import type { RewardsSummary } from '../game/sessionRewards';
  import type {
    ListenMeaningSelection,
    ListenMeaningSession,
    ListenMeaningSummary,
  } from './listenMeaningSession';

  interface Props {
    cards: readonly Card[];
    speaker: Speaker;
    startSession: (selection: ListenMeaningSelection) => Promise<ListenMeaningSession>;
    /** Called once a round with at least one answer ends. */
    onSessionEnd: () => void;
  }

  const { cards, speaker, startSession, onSessionEnd }: Props = $props();

  const LANGUAGES: readonly Language[] = ['zh', 'en'];

  interface Feedback {
    outcome: Outcome;
    target: Card;
    chosen: Card | 'unknown';
  }

  type Screen =
    | { kind: 'setup' }
    | { kind: 'starting' }
    | { kind: 'notEligible' }
    | { kind: 'playing' }
    | { kind: 'summary'; summary: ListenMeaningSummary };

  let language = $state<Language>('zh');
  let view = $state<Screen>({ kind: 'setup' });
  let error = $state<'startFailed' | 'saveFailed' | undefined>();
  let session: ListenMeaningSession | undefined;
  let question = $state.raw<ListenMeaningQuestion>();
  let position = $state(0);
  let total = $state(0);
  let voice = $state<'available' | 'missing' | 'failed'>('available');
  let hintShown = $state(false);
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
    error = undefined;
    view = { kind: 'starting' };
    try {
      session = await startSession({ cards, language, labelIds: [] });
      voice = (await speaker.hasVoice(language)) ? 'available' : 'missing';
    } catch {
      error = 'startFailed';
      view = { kind: 'setup' };
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
    hintShown = false;
    feedback = undefined;
    if (question === undefined) {
      finish();
      return;
    }
    await tick();
    // The answer zone, not an option: Space must replay the word, not choose (GAME_DESIGN.md 6.0).
    optionsElement?.focus();
    play();
  }

  function play(slow = false) {
    const word = feedback?.target ?? question?.target;
    if (word === undefined || voice !== 'available') {
      return;
    }
    speaker
      .speak(word.term, word.language, slow ? { rate: MINI_GAME_CONFIG.slowRate } : undefined)
      .catch(() => {
        voice = 'failed';
      });
  }

  function playChosen() {
    if (feedback !== undefined && feedback.chosen !== 'unknown' && voice === 'available') {
      void speaker.speak(feedback.chosen.term, feedback.chosen.language).catch(() => undefined);
    }
  }

  async function choose(choice: Card | 'unknown') {
    if (session === undefined || question === undefined || feedback !== undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    const target = question.target;
    try {
      const { outcome } = await session.answer(choice, { hintsUsed: hintShown ? 1 : 0 });
      feedback = { outcome, target, chosen: choice };
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    if (feedback.outcome === 'wrong') {
      play();
    } else {
      advanceTimer = setTimeout(() => void next(), MINI_GAME_CONFIG.feedbackCorrectMs);
    }
    await tick();
    document.getElementById('listen-meaning-continue')?.focus();
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

  function restart() {
    session = undefined;
    question = undefined;
    feedback = undefined;
    rewards = undefined;
    view = { kind: 'setup' };
  }

  function isOwnKeyTarget(target: EventTarget | null, key: string): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.closest('input, textarea, select, [contenteditable="true"]') !== null) {
      return true;
    }
    return (key === ' ' || key === 'Enter') && target.closest('button, a, summary') !== null;
  }

  function onKeydown(event: KeyboardEvent) {
    if (view.kind !== 'playing' || event.ctrlKey || event.metaKey || event.altKey) {
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
      play();
    } else if (key === 'l') {
      play(true);
    } else if (event.key === '0') {
      void choose('unknown');
    } else if (/^[1-9]$/.test(event.key) && chosen !== undefined) {
      void choose(chosen);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section aria-labelledby="listen-meaning-title" class="listen-meaning">
  <h2 id="listen-meaning-title">{fr.listenMeaning.title}</h2>

  {#if error !== undefined}
    <p role="alert" class="error">{fr.listenMeaning[error]}</p>
  {/if}

  {#if view.kind === 'setup' || view.kind === 'starting'}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      <p>{fr.listenMeaning.intro}</p>
      <fieldset>
        <legend>{fr.listenMeaning.languageLegend}</legend>
        {#each LANGUAGES as code (code)}
          <label class="choice">
            <input type="radio" name="listen-meaning-language" value={code} bind:group={language} />
            {fr.languages[code]}
          </label>
        {/each}
      </fieldset>
      <button type="submit" class="primary" disabled={view.kind === 'starting'}
        >{fr.listenMeaning.start}</button
      >
      {#if view.kind === 'starting'}
        <p>{fr.listenMeaning.starting}</p>
      {/if}
    </form>
  {:else if view.kind === 'notEligible'}
    <p>{fr.listenMeaning.notEligible}</p>
    <button type="button" onclick={restart}>{fr.listenMeaning.back}</button>
  {:else if view.kind === 'playing' && question !== undefined}
    {@const target = question.target}
    <div class="toolbar">
      <p class="progress">
        {format(fr.listenMeaning.progress, { position: position + 1, total })}
      </p>
      <button type="button" onclick={quit}>{fr.listenMeaning.quit}</button>
    </div>

    <div class="stage-card">
      {#if written}
        <p class="notice">
          {voice === 'failed'
            ? fr.listenMeaning.audioError
            : target.language === 'zh'
              ? fr.listenMeaning.noVoice
              : fr.listenMeaning.noVoiceEn}
        </p>
        <p class="term" lang={lang(target.language)} data-testid="written-word">{target.term}</p>
      {:else}
        <button
          type="button"
          class="speaker"
          aria-keyshortcuts="R Space"
          aria-label={fr.listenMeaning.replay}
          onclick={() => {
            play();
          }}
        >
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            <path class="wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
          </svg>
        </button>
      {/if}
      <p class="prompt">{fr.listenMeaning.prompt}</p>
      {#if hintShown}
        <p class="hint">
          {#if target.language === 'zh' && target.pinyin !== undefined}
            <span lang="zh-CN"><Pinyin pinyin={target.pinyin} /></span>
          {:else}
            <span lang={lang(target.language)}>{target.term}</span>
          {/if}
          <span class="help"> · {fr.listenMeaning.hintUsed}</span>
        </p>
      {/if}
      <p class="help">{fr.listenMeaning.keysHelp}</p>
    </div>

    <div
      class="options"
      role="group"
      aria-label={fr.listenMeaning.optionsLabel}
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
          <span>{option.translation}</span>
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
          <button
            type="button"
            aria-keyshortcuts="L"
            onclick={() => {
              play(true);
            }}><kbd aria-hidden="true">L</kbd> {fr.listenMeaning.slow}</button
          >
        {/if}
        {#if !hintShown && (target.language === 'zh' ? target.pinyin !== undefined : !written)}
          <button
            type="button"
            onclick={() => {
              hintShown = true;
            }}>{fr.listenMeaning.hint[target.language]}</button
          >
        {/if}
        <button
          type="button"
          class="unknown"
          aria-keyshortcuts="0"
          disabled={busy}
          onclick={() => void choose('unknown')}
          ><kbd aria-hidden="true">0</kbd> {fr.listenMeaning.unknown}</button
        >
      </div>
    {:else}
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
            ? format(fr.listenMeaning.wrong, { term: feedback.target.term })
            : `${fr.listenMeaning.right} ${feedback.target.term}`}
        </p>
        <p class="word">
          <span lang={lang(feedback.target.language)}>{feedback.target.term}</span>
          {#if feedback.target.pinyin !== undefined}
            · <span lang="zh-CN"><Pinyin pinyin={feedback.target.pinyin} /></span>
          {/if}
          · <span>{feedback.target.translation}</span>
        </p>
        {#if feedback.outcome === 'wrong'}
          <p>
            {feedback.chosen === 'unknown'
              ? fr.listenMeaning.unknownChosen
              : format(fr.listenMeaning.chose, {
                  meaning: feedback.chosen.translation,
                  term: feedback.chosen.term,
                })}
          </p>
        {/if}
      </div>
      <div class="actions">
        {#if feedback.outcome === 'wrong' && !written}
          <button
            type="button"
            onclick={() => {
              play();
            }}>{fr.listenMeaning.replay}</button
          >
          {#if feedback.chosen !== 'unknown'}
            <button type="button" onclick={playChosen}>{fr.listenMeaning.listenChosen}</button>
          {/if}
        {/if}
        <button
          type="button"
          id="listen-meaning-continue"
          class="primary"
          onclick={() => void next()}>{fr.listenMeaning.continue}</button
        >
      </div>
    {/if}
  {:else if view.kind === 'summary'}
    <h3>{fr.listenMeaning.summaryTitle}</h3>
    <p class="score">
      {format(fr.listenMeaning.score, {
        correct: view.summary.correct,
        total: view.summary.answered,
      })}
    </p>
    {#if rewards !== undefined}
      <RewardsPanel {rewards} />
    {/if}
    <div class="actions">
      <button type="button" class="primary" onclick={() => void start()}
        >{fr.listenMeaning.again}</button
      >
      <button type="button" onclick={restart}>{fr.listenMeaning.back}</button>
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

  fieldset {
    margin: 0 0 var(--space-4);
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

  .term {
    font-size: var(--text-hanzi);
    line-height: 1.2;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .option {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    min-height: var(--target-lg);
    padding: var(--space-2) var(--space-4);
    border: 2px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-lg);
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

  .hint,
  .notice {
    color: var(--ink-soft);
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
