<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Card, Language } from '../../domain/card';
  import type { BridgeBoard } from '../../domain/game/bridgeMatch';
  import { slowRateOf } from '../../domain/speechRate';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import Pinyin from '../../ui/Pinyin.svelte';
  import RewardsPanel from '../game/RewardsPanel.svelte';
  import type { RewardsSummary } from '../game/sessionRewards';
  import type { BridgeMatchSelection, BridgeMatchSession } from './bridgeMatchSession';
  import { isOwnKeyTarget, isShortcut } from './gameKeys';
  import type { MiniGameSummary } from './miniGameRecorder';

  interface Props {
    /** Every word: the game keeps those of the language. */
    cards: readonly Card[];
    language: Language;
    /** Words imposed by a step session of the path; every word of the language otherwise. */
    cardIds?: readonly string[];
    speaker: Speaker;
    /** The rate of the voice chosen in the settings: the slow replay reads at half of it. */
    speechRate: number;
    startSession: (selection: BridgeMatchSelection) => Promise<BridgeMatchSession>;
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

  type Screen =
    | { kind: 'intro' }
    | { kind: 'starting' }
    | { kind: 'notEligible' }
    | { kind: 'playing' }
    | { kind: 'summary'; summary: MiniGameSummary };

  /** How long two wrongly linked cards stay marked before turning back (GAME_DESIGN.md 6.4). */
  const FLASH_MS = 600;
  const LETTERS = 'abcdefgh';

  let view = $state<Screen>({ kind: 'intro' });
  let error = $state<'startFailed' | 'saveFailed' | undefined>();
  let session: BridgeMatchSession | undefined;
  let board = $state.raw<BridgeBoard>();
  let boardNumber = $state(0);
  let matched = $state.raw<ReadonlySet<string>>(new Set());
  let selectedLeft = $state<string>();
  let selectedRight = $state<string>();
  let flash = $state.raw<{ left: string; right: string }>();
  let announcement = $state('');
  let voice = $state(false);
  let busy = $state(false);
  let rewards = $state.raw<RewardsSummary>();
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');

  onDestroy(() => {
    clearTimeout(flashTimer);
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
        voice,
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
    announcement = '';
    view = { kind: 'playing' };
    showBoard();
  }

  function showBoard() {
    if (session === undefined) {
      return;
    }
    board = session.board;
    boardNumber = session.boardNumber;
    matched = new Set(session.matched);
    selectedLeft = undefined;
    selectedRight = undefined;
    if (board === undefined) {
      finish();
    }
  }

  function play(word: Card | undefined, slow = false) {
    if (word === undefined || !voice || board?.variant.left !== 'audio') {
      return;
    }
    speaker.unlock();
    void speaker
      .speak(word.term, word.language, slow ? { rate: slowRateOf(speechRate) } : undefined)
      .catch(() => undefined);
  }

  function chooseLeft(word: Card) {
    if (matched.has(word.id) || busy) {
      return;
    }
    play(word);
    selectedLeft = word.id;
    void tryLink();
  }

  function chooseRight(word: Card) {
    if (matched.has(word.id) || busy) {
      return;
    }
    selectedRight = word.id;
    void tryLink();
  }

  async function tryLink() {
    const [leftId, rightId] = [selectedLeft, selectedRight];
    if (
      session === undefined ||
      board === undefined ||
      leftId === undefined ||
      rightId === undefined
    ) {
      return;
    }
    const left = board.left.find(({ id }) => id === leftId);
    const right = board.right.find(({ id }) => id === rightId);
    busy = true;
    error = undefined;
    try {
      const result = await session.link(leftId, rightId);
      if (result.kind === 'mismatch') {
        clearTimeout(flashTimer);
        flash = { left: leftId, right: rightId };
        flashTimer = setTimeout(() => {
          flash = undefined;
        }, FLASH_MS);
        announcement = format(fr.bridgeMatch.mismatch, {
          left: left === undefined ? '' : leftText(left),
          right: right === undefined ? '' : rightText(right),
        });
        selectedLeft = undefined;
        selectedRight = undefined;
        return;
      }
      const total = board.left.length;
      announcement = format(fr.bridgeMatch.match, {
        term: left?.term ?? '',
        meaning: left?.translation ?? '',
        found: session.board === board ? session.matched.size : total,
        total,
      });
      showBoard();
    } catch {
      error = 'saveFailed';
      selectedLeft = undefined;
      selectedRight = undefined;
    } finally {
      busy = false;
    }
  }

  /** What a card of the left bank says to a screen reader, sound cards included. */
  function leftText(word: Card): string {
    if (board?.variant.left === 'audio') {
      const index = board.left.findIndex(({ id }) => id === word.id);
      return format(fr.bridgeMatch.sound, { number: index + 1 });
    }
    return word.term;
  }

  function rightText(word: Card): string {
    switch (board?.variant.right) {
      case 'term':
        return word.term;
      case 'pinyin':
        return word.pinyin ?? '';
      default:
        return word.translation;
    }
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
    if (view.kind !== 'playing' || board === undefined || isShortcut(event)) {
      return;
    }
    if (isOwnKeyTarget(event.target, event.key)) {
      return;
    }
    const key = event.key.toLowerCase();
    const selected = board.left.find(({ id }) => id === selectedLeft);
    if (/^[1-9]$/.test(key)) {
      const word = board.left[Number(key) - 1];
      if (word !== undefined) {
        chooseLeft(word);
      }
    } else if (LETTERS.includes(key) && key.length === 1) {
      const word = board.right[LETTERS.indexOf(key)];
      if (word !== undefined) {
        chooseRight(word);
      }
    } else if (key === ' ' || key === 'r') {
      event.preventDefault();
      play(selected);
    } else if (key === 'l') {
      play(selected, true);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section aria-labelledby="bridge-match-title" class="bridge-match">
  <h2 id="bridge-match-title">{fr.bridgeMatch.title}</h2>

  {#if error !== undefined}
    <p role="alert" class="error">{fr.bridgeMatch[error]}</p>
  {/if}

  {#if view.kind === 'intro' || view.kind === 'starting'}
    <p>{fr.bridgeMatch.intro}</p>
    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={view.kind === 'starting'}
        onclick={() => void start()}>{fr.bridgeMatch.start}</button
      >
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{fr.bridgeMatch.back}</button>
      {/if}
    </div>
    {#if view.kind === 'starting'}
      <p>{fr.bridgeMatch.starting}</p>
    {/if}
  {:else if view.kind === 'notEligible'}
    <p>{fr.bridgeMatch.notEligible}</p>
    {#if onExit !== undefined}
      <button type="button" onclick={onExit}>{fr.bridgeMatch.back}</button>
    {/if}
  {:else if view.kind === 'playing' && board !== undefined}
    {@const total = board.left.length}
    <div class="toolbar">
      <p class="progress">
        {format(fr.bridgeMatch.progress, { board: boardNumber, found: matched.size, total })}
      </p>
      <button type="button" onclick={() => void quit()}>{fr.bridgeMatch.quit}</button>
    </div>

    <svg
      class="bridge"
      viewBox="0 0 {total * 24} 24"
      role="img"
      aria-label={format(fr.bridgeMatch.bridgeLabel, { found: matched.size, total })}
    >
      {#each board.left as word, index (word.id)}
        <rect
          class="plank"
          class:laid={index < matched.size}
          x={index * 24 + 2}
          y="4"
          width="20"
          height="16"
          rx="3"
        />
      {/each}
    </svg>

    {#if !voice && board.variant.left === 'term' && board.variant.right !== 'pinyin'}
      <p class="notice">{fr.bridgeMatch.noVoice}</p>
    {/if}

    <div class="banks">
      <div class="bank" role="group" aria-label={fr.bridgeMatch.leftBank[board.variant.left]}>
        {#each board.left as word, index (word.id)}
          {@const isMatched = matched.has(word.id)}
          <button
            type="button"
            class="card"
            class:matched={isMatched}
            class:wrong={flash?.left === word.id}
            aria-pressed={selectedLeft === word.id}
            aria-keyshortcuts={String(index + 1)}
            disabled={isMatched}
            aria-label={board.variant.left === 'audio'
              ? format(fr.bridgeMatch.sound, { number: index + 1 })
              : undefined}
            onclick={() => {
              chooseLeft(word);
            }}
          >
            <kbd aria-hidden="true">{index + 1}</kbd>
            {#if board.variant.left === 'audio'}
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path class="wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
              </svg>
            {:else}
              <span class="text" lang={lang(word.language)}>{word.term}</span>
            {/if}
            {#if isMatched}<span class="mark" aria-hidden="true">✓</span>{/if}
          </button>
        {/each}
      </div>

      <div class="bank" role="group" aria-label={fr.bridgeMatch.rightBank[board.variant.right]}>
        {#each board.right as word, index (word.id)}
          {@const isMatched = matched.has(word.id)}
          <button
            type="button"
            class="card"
            class:matched={isMatched}
            class:wrong={flash?.right === word.id}
            aria-pressed={selectedRight === word.id}
            aria-keyshortcuts={LETTERS.charAt(index).toUpperCase()}
            disabled={isMatched}
            onclick={() => {
              chooseRight(word);
            }}
          >
            <kbd aria-hidden="true">{LETTERS.charAt(index).toUpperCase()}</kbd>
            {#if board.variant.right === 'term'}
              <span class="text" lang={lang(word.language)}>{word.term}</span>
            {:else if board.variant.right === 'pinyin'}
              <span class="text" lang="zh-CN"><Pinyin pinyin={word.pinyin ?? ''} /></span>
            {:else}
              <span class="text">{word.translation}</span>
            {/if}
            {#if isMatched}<span class="mark" aria-hidden="true">✓</span>{/if}
          </button>
        {/each}
      </div>
    </div>

    <p role="status" aria-live="polite" class="announcement">{announcement}</p>
    <p class="help">{fr.bridgeMatch.keysHelp}</p>
  {:else if view.kind === 'summary'}
    <h3>{fr.bridgeMatch.summaryTitle}</h3>
    <p class="score">
      {format(fr.bridgeMatch.score, {
        correct: view.summary.correct,
        total: view.summary.answered,
      })}
    </p>
    {#if rewards !== undefined}
      <RewardsPanel {rewards} />
    {/if}
    <div class="actions">
      <button type="button" class="primary" onclick={() => void start()}
        >{fr.bridgeMatch.again}</button
      >
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{fr.bridgeMatch.back}</button>
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

  .bridge {
    display: block;
    width: 100%;
    max-width: 24rem;
    height: 2rem;
    margin: 0 auto var(--space-3);
  }

  .plank {
    fill: var(--track);
    stroke: var(--line-strong);
    stroke-width: 1;
  }

  .plank.laid {
    fill: var(--jade);
    stroke: var(--jade-strong);
    animation: lay 250ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  @keyframes lay {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  .banks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }

  .bank {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .card {
    min-width: 0;
    display: flex;
    gap: var(--space-3);
    align-items: center;
    justify-content: flex-start;
    min-height: var(--target-lg);
    padding: var(--space-2) var(--space-3);
    border: 2px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    text-align: left;
    transition: border-color 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .card[aria-pressed='true'] {
    border-color: var(--info);
    background: var(--info-soft);
  }

  .card.matched,
  .card.matched:disabled {
    border-color: var(--jade);
    background: var(--jade-soft);
    color: var(--jade-strong);
    opacity: 1;
    cursor: default;
  }

  .card.wrong {
    border-color: var(--ochre);
    background: var(--ochre-soft);
  }

  .card svg {
    fill: currentColor;
  }

  .card .wave {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .card kbd {
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

  .text {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .text[lang='zh-CN'] {
    font-family: var(--font-hanzi);
  }

  .mark {
    margin-left: auto;
    font-weight: var(--weight-heavy);
  }

  .announcement {
    min-height: 1.5em;
    font-weight: var(--weight-bold);
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
    .card {
      transition: none;
    }

    .plank.laid {
      animation: none;
    }
  }
</style>
