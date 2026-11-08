<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Card, Language } from '../../domain/card';
  import { slowRateOf } from '../../domain/speechRate';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import RewardsPanel from '../game/RewardsPanel.svelte';
  import type { RewardsSummary } from '../game/sessionRewards';
  import { isOwnKeyTarget, isShortcut } from './gameKeys';
  import type { MiniGameSelection, MiniGameSummary } from './miniGameRecorder';
  import type { SentenceShuffleSession, ShuffleItem, ShuffleTile } from './sentenceShuffleSession';

  interface Props {
    /** Every word: the game keeps those of the language with an example of 3 to 8 chunks. */
    cards: readonly Card[];
    language: Language;
    /** Words imposed by a step session of the path; every eligible word otherwise. */
    cardIds?: readonly string[];
    speaker: Speaker;
    /** The rate of the voice chosen in the settings: the slow replay reads at half of it. */
    speechRate: number;
    startSession: (selection: MiniGameSelection) => Promise<SentenceShuffleSession>;
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

  /** 'retry': a wrong try, one more allowed; 'wrong': the tries are over; then the sentence. */
  type Feedback =
    { kind: 'retry' } | { kind: 'wrong'; item: ShuffleItem } | { kind: 'right'; item: ShuffleItem };

  type Screen =
    | { kind: 'intro' }
    | { kind: 'starting' }
    | { kind: 'notEligible' }
    | { kind: 'playing' }
    | { kind: 'summary'; summary: MiniGameSummary };

  let view = $state<Screen>({ kind: 'intro' });
  let error = $state<'startFailed' | 'saveFailed' | undefined>();
  let session: SentenceShuffleSession | undefined;
  let item = $state.raw<ShuffleItem>();
  let position = $state(0);
  let total = $state(0);
  /** The ids of the tiles on the line, in order. */
  let placed = $state.raw<string[]>([]);
  /** How many tiles at the start of the line were checked right. */
  let kept = $state(0);
  let feedback = $state.raw<Feedback>();
  let voice = $state(false);
  let busy = $state(false);
  let rewards = $state.raw<RewardsSummary>();
  let reserveElement = $state<HTMLElement>();

  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');
  const separator = (code: Language) => (code === 'en' ? ' ' : '');
  const reserveTiles = $derived(item?.tiles.filter(({ id }) => !placed.includes(id)) ?? []);
  const lineTiles = $derived(
    placed.flatMap((id) => item?.tiles.filter((tile) => tile.id === id) ?? []),
  );
  /** Level 1 reads at the start, level 2 after an error, level 3 once checked (GAME_DESIGN.md 6.6). */
  const canListen = $derived(
    voice &&
      item !== undefined &&
      (item.difficulty === 1 ||
        (item.difficulty === 2 && item.attempt > 1) ||
        (feedback !== undefined && feedback.kind !== 'retry')),
  );

  onDestroy(() => {
    speaker.cancel();
  });

  async function start() {
    // Phones only let speech start inside the tap: unlock it before any await.
    speaker.unlock();
    error = undefined;
    view = { kind: 'starting' };
    try {
      voice = await speaker.hasVoice(language);
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
    item = session.current;
    position = session.position;
    total = session.total;
    placed = [];
    kept = 0;
    feedback = undefined;
    if (item === undefined) {
      finish();
      return;
    }
    await tick();
    reserveElement?.focus();
    if (canListen) {
      play();
    }
  }

  function sentenceOf(shown: ShuffleItem): string {
    return shown.target.example?.trim() ?? shown.chunks.join(separator(shown.target.language));
  }

  function play(slow = false) {
    const shown = feedback !== undefined && feedback.kind !== 'retry' ? feedback.item : item;
    if (shown === undefined || !voice) {
      return;
    }
    speaker.unlock();
    void speaker
      .speak(
        sentenceOf(shown),
        shown.target.language,
        slow ? { rate: slowRateOf(speechRate) } : undefined,
      )
      .catch(() => undefined);
  }

  function add(tile: ShuffleTile) {
    if (feedback !== undefined && feedback.kind !== 'retry') {
      return;
    }
    placed = [...placed, tile.id];
  }

  function remove(tile: ShuffleTile) {
    const index = placed.indexOf(tile.id);
    if ((feedback !== undefined && feedback.kind !== 'retry') || index < kept) {
      return;
    }
    placed = placed.filter((id) => id !== tile.id);
  }

  async function validate() {
    if (session === undefined || item === undefined || busy || placed.length === 0) {
      return;
    }
    if (feedback !== undefined && feedback.kind !== 'retry') {
      return;
    }
    busy = true;
    error = undefined;
    const checked = item;
    try {
      const result = await session.check(placed);
      if (result.outcome !== 'wrong') {
        feedback = { kind: 'right', item: checked };
      } else if (result.canRetry) {
        placed = placed.slice(0, result.keep);
        kept = result.keep;
        item = session.current;
        feedback = { kind: 'retry' };
      } else {
        feedback = { kind: 'wrong', item: checked };
      }
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    if (feedback.kind !== 'retry') {
      play();
      await tick();
      document.getElementById('sentence-shuffle-continue')?.focus();
    } else if (canListen) {
      play();
    }
  }

  async function claimRight() {
    if (session === undefined || item === undefined || busy) {
      return;
    }
    const checked = item;
    busy = true;
    try {
      await session.claimRight();
      feedback = { kind: 'right', item: checked };
    } catch {
      error = 'saveFailed';
    } finally {
      busy = false;
    }
    await tick();
    document.getElementById('sentence-shuffle-continue')?.focus();
  }

  async function next() {
    if (session === undefined || busy) {
      return;
    }
    if (feedback?.kind === 'wrong') {
      busy = true;
      try {
        await session.giveUp();
      } catch {
        error = 'saveFailed';
        return;
      } finally {
        busy = false;
      }
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
    await session?.quit();
    finish();
  }

  function onKeydown(event: KeyboardEvent) {
    if (view.kind !== 'playing' || item === undefined || isShortcut(event)) {
      return;
    }
    if (isOwnKeyTarget(event.target, event.key)) {
      return;
    }
    const done = feedback !== undefined && feedback.kind !== 'retry';
    const key = event.key.toLowerCase();
    if (event.key === 'Enter') {
      event.preventDefault();
      void (done ? next() : validate());
    } else if (done) {
      return;
    } else if (/^[1-9]$/.test(key)) {
      const tile = reserveTiles[Number(key) - 1];
      if (tile !== undefined) {
        add(tile);
      }
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      const last = lineTiles.at(-1);
      if (last !== undefined) {
        remove(last);
      }
    } else if (key === 'r' && canListen) {
      play();
    } else if (key === 'l' && canListen) {
      play(true);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section aria-labelledby="sentence-shuffle-title" class="sentence-shuffle">
  <h2 id="sentence-shuffle-title">{fr.sentenceShuffle.title}</h2>

  {#if error !== undefined}
    <p role="alert" class="error">{fr.sentenceShuffle[error]}</p>
  {/if}

  {#if view.kind === 'intro' || view.kind === 'starting'}
    <p>{fr.sentenceShuffle.intro}</p>
    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={view.kind === 'starting'}
        onclick={() => void start()}>{fr.sentenceShuffle.start}</button
      >
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{fr.sentenceShuffle.back}</button>
      {/if}
    </div>
    {#if view.kind === 'starting'}
      <p>{fr.sentenceShuffle.starting}</p>
    {/if}
  {:else if view.kind === 'notEligible'}
    <p>{fr.sentenceShuffle.notEligible}</p>
    {#if onExit !== undefined}
      <button type="button" onclick={onExit}>{fr.sentenceShuffle.back}</button>
    {/if}
  {:else if view.kind === 'playing' && item !== undefined}
    {@const done = feedback !== undefined && feedback.kind !== 'retry'}
    <div class="toolbar">
      <p class="progress">
        {format(fr.sentenceShuffle.progress, { position: position + 1, total })}
      </p>
      <button type="button" onclick={() => void quit()}>{fr.sentenceShuffle.quit}</button>
    </div>

    <p class="meaning">
      {format(fr.sentenceShuffle.meaning, {
        term: item.target.term,
        translation: item.target.translation,
      })}
    </p>

    <div
      class="line"
      class:done
      role="group"
      aria-label={fr.sentenceShuffle.line}
      lang={lang(item.target.language)}
    >
      {#each lineTiles as tile, index (tile.id)}
        <button
          type="button"
          class="tile"
          class:kept={index < kept || feedback?.kind === 'right'}
          disabled={done || index < kept}
          onclick={() => {
            remove(tile);
          }}>{tile.text}</button
        >
      {:else}
        <span class="placeholder" lang="fr">{fr.sentenceShuffle.lineEmpty}</span>
      {/each}
    </div>

    {#if !done}
      <div
        class="reserve"
        role="group"
        aria-label={fr.sentenceShuffle.reserve}
        tabindex="-1"
        lang={lang(item.target.language)}
        bind:this={reserveElement}
      >
        {#each reserveTiles as tile, index (tile.id)}
          <button
            type="button"
            class="tile"
            aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
            disabled={busy}
            onclick={() => {
              add(tile);
            }}
            >{#if index < 9}<kbd aria-hidden="true" lang="fr">{index + 1}</kbd>{/if}<span
              >{tile.text}</span
            ></button
          >
        {/each}
      </div>
      {#if item.tiles.some(({ trap }) => trap)}
        <p class="help">{fr.sentenceShuffle.trapHint}</p>
      {/if}
      <p class="help">{fr.sentenceShuffle.keysHelp}</p>
    {/if}

    {#if feedback?.kind === 'retry'}
      <p role="status" aria-live="polite" class="feedback feedback-wrong">
        <span aria-hidden="true">✗</span>
        {fr.sentenceShuffle.retry}
      </p>
    {:else if feedback !== undefined}
      <div
        role="status"
        aria-live="polite"
        class="feedback"
        class:feedback-right={feedback.kind === 'right'}
        class:feedback-wrong={feedback.kind === 'wrong'}
      >
        <p class="verdict">
          <span aria-hidden="true">{feedback.kind === 'right' ? '✓' : '✗'}</span>
          {feedback.kind === 'right' ? fr.sentenceShuffle.right : fr.sentenceShuffle.wrong}
        </p>
        <p class="sentence" lang={lang(feedback.item.target.language)}>
          {sentenceOf(feedback.item)}
        </p>
      </div>
    {/if}

    <div class="actions">
      {#if !done}
        <button
          type="button"
          class="primary"
          disabled={busy || placed.length === 0}
          onclick={() => void validate()}>{fr.sentenceShuffle.validate}</button
        >
      {/if}
      {#if canListen}
        <button
          type="button"
          aria-keyshortcuts="R"
          onclick={() => {
            play();
          }}>{fr.sentenceShuffle.listen}</button
        >
        <button
          type="button"
          aria-keyshortcuts="L"
          onclick={() => {
            play(true);
          }}><kbd aria-hidden="true">L</kbd> {fr.sentenceShuffle.slow}</button
        >
      {/if}
      {#if feedback?.kind === 'retry' || feedback?.kind === 'wrong'}
        <button type="button" disabled={busy} onclick={() => void claimRight()}
          >{fr.sentenceShuffle.claimRight}</button
        >
      {/if}
      {#if done}
        <button
          type="button"
          id="sentence-shuffle-continue"
          class="primary"
          disabled={busy}
          onclick={() => void next()}>{fr.sentenceShuffle.continue}</button
        >
      {/if}
    </div>
  {:else if view.kind === 'summary'}
    <h3>{fr.sentenceShuffle.summaryTitle}</h3>
    <p class="score">
      {format(fr.sentenceShuffle.score, {
        correct: view.summary.correct,
        total: view.summary.answered,
      })}
    </p>
    {#if rewards !== undefined}
      <RewardsPanel {rewards} />
    {/if}
    <div class="actions">
      <button type="button" class="primary" onclick={() => void start()}
        >{fr.sentenceShuffle.again}</button
      >
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{fr.sentenceShuffle.back}</button>
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

  .meaning {
    color: var(--ink-soft);
  }

  .line,
  .reserve {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    min-height: calc(var(--target-lg) + 2 * var(--space-3));
    margin-bottom: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
  }

  .line {
    border: 2px dashed var(--line-strong);
    background: var(--surface);
  }

  .line.done {
    border-style: solid;
  }

  .reserve {
    background: var(--surface-2);
  }

  .tile {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    min-height: var(--target);
    padding: var(--space-2) var(--space-3);
    border: 2px solid var(--line-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    transition: transform 200ms ease-out;
  }

  .line[lang='zh-CN'] .tile,
  .reserve[lang='zh-CN'] .tile {
    font-family: var(--font-hanzi);
  }

  .tile:disabled {
    opacity: 1;
    cursor: default;
  }

  .tile.kept {
    border-color: var(--jade);
    background: var(--jade-soft);
    color: var(--jade-strong);
  }

  .tile kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-soft);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  .placeholder,
  .help {
    color: var(--ink-soft);
    font-size: var(--text-sm);
  }

  .sentence {
    font-size: var(--text-xl);
  }

  .score {
    font-size: var(--text-lg);
    font-weight: var(--weight-heavy);
  }

  @media (prefers-reduced-motion: reduce) {
    .tile {
      transition: none;
    }
  }
</style>
