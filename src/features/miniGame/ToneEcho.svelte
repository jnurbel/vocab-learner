<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Card, Language } from '../../domain/card';
  import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
  import {
    normalizeTonePattern,
    questionCard,
    type PairSide,
    type ToneEchoQuestion,
  } from '../../domain/game/toneEcho';
  import { slowRateOf } from '../../domain/speechRate';
  import type { Outcome } from '../../domain/srs/reviewState';
  import type { Tone } from '../../domain/toneSyllables';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import Pinyin from '../../ui/Pinyin.svelte';
  import ToneCurve from '../../ui/ToneCurve.svelte';
  import RewardsPanel from '../game/RewardsPanel.svelte';
  import type { RewardsSummary } from '../game/sessionRewards';
  import { isOwnKeyTarget, isShortcut } from './gameKeys';
  import type { MiniGameSelection, MiniGameSummary } from './miniGameRecorder';
  import type { ToneEchoSession } from './toneEchoSession';

  interface Props {
    /** Every word: the game keeps those of the language. */
    cards: readonly Card[];
    language: Language;
    /** Words imposed by a step session of the path; every word of the language otherwise. */
    cardIds?: readonly string[];
    speaker: Speaker;
    /** The rate of the voice chosen in the settings: the slow replay reads at half of it. */
    speechRate: number;
    startSession: (selection: MiniGameSelection) => Promise<ToneEchoSession>;
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
    question: ToneEchoQuestion;
    /** The tones or the side chosen. */
    given: number | string;
  }

  type Screen =
    | { kind: 'intro' }
    | { kind: 'starting' }
    | { kind: 'noVoice' }
    | { kind: 'notEligible' }
    | { kind: 'playing' }
    | { kind: 'summary'; summary: MiniGameSummary };

  const TONE_KEYS: readonly { tone: Tone; digit: number; mark: string }[] = [
    { tone: 1, digit: 1, mark: 'ā' },
    { tone: 2, digit: 2, mark: 'á' },
    { tone: 3, digit: 3, mark: 'ǎ' },
    { tone: 4, digit: 4, mark: 'à' },
    { tone: 'neutral', digit: 5, mark: 'a' },
  ];

  let view = $state<Screen>({ kind: 'intro' });
  let error = $state<'startFailed' | 'saveFailed' | undefined>();
  let session: ToneEchoSession | undefined;
  let question = $state.raw<ToneEchoQuestion>();
  let position = $state(0);
  let total = $state(0);
  let typed = $state('');
  let feedback = $state.raw<Feedback>();
  let busy = $state(false);
  let rewards = $state.raw<RewardsSummary>();
  let answerZone = $state<HTMLElement>();
  let advanceTimer: ReturnType<typeof setTimeout> | undefined;

  const title = $derived(language === 'zh' ? fr.toneEcho.title : fr.toneEcho.titleEn);
  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');

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
      if (!(await speaker.hasVoice(language))) {
        view = { kind: 'noVoice' };
        return;
      }
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
    typed = '';
    if (question === undefined) {
      finish();
      return;
    }
    await tick();
    answerZone?.focus();
    play();
  }

  /** What is read aloud for a question: the character, the word, or the side heard. */
  function soundOf(asked: ToneEchoQuestion): { text: string; language: Language } {
    switch (asked.kind) {
      case 'tone':
        return { text: asked.char, language: 'zh' };
      case 'pattern':
        return { text: asked.card.term, language: 'zh' };
      case 'pair':
        return asked.sides[asked.heard];
    }
  }

  function speak(sound: { text: string; language: Language }, slow = false): Promise<void> {
    return speaker
      .speak(sound.text, sound.language, slow ? { rate: slowRateOf(speechRate) } : undefined)
      .catch(() => undefined);
  }

  function play(slow = false) {
    const asked = feedback?.question ?? question;
    if (asked === undefined) {
      return;
    }
    speaker.unlock();
    void speak(soundOf(asked), slow);
  }

  function chosenSide(asked: ToneEchoQuestion, given: number | string): PairSide | undefined {
    return asked.kind === 'pair' && (given === 0 || given === 1) ? asked.sides[given] : undefined;
  }

  function playChosen() {
    const side = feedback === undefined ? undefined : chosenSide(feedback.question, feedback.given);
    if (side !== undefined) {
      speaker.unlock();
      void speak(side);
    }
  }

  async function answer(given: number | string) {
    if (session === undefined || question === undefined || feedback !== undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    try {
      const { outcome, question: asked } = await session.answer(given);
      feedback = { outcome, question: asked, given };
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    if (feedback.outcome === 'wrong') {
      // Both sounds, one after the other, when there are two (GAME_DESIGN.md 6.3).
      const asked = feedback.question;
      const side = chosenSide(asked, feedback.given);
      void speak(soundOf(asked)).then(() => (side === undefined ? undefined : speak(side)));
    } else {
      advanceTimer = setTimeout(() => void next(), MINI_GAME_CONFIG.feedbackCorrectMs);
    }
    await tick();
    document.getElementById('tone-echo-continue')?.focus();
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

  function toneOfDigit(digit: string): Tone {
    return digit === '5' ? 'neutral' : (Number(digit) as 1 | 2 | 3 | 4);
  }

  /** The tones of the answer: those of the question, those chosen. */
  function heardTones(asked: ToneEchoQuestion): Tone[] {
    switch (asked.kind) {
      case 'tone':
        return [asked.tone];
      case 'pattern':
        return asked.syllables.map(({ tone }) => tone);
      case 'pair':
        return [];
    }
  }

  function chosenTones(given: number | string): Tone[] {
    const digits = typeof given === 'number' ? String(given) : normalizeTonePattern(given);
    return Array.from(digits, toneOfDigit);
  }

  function toneNames(tones: readonly Tone[]): string {
    return tones.map((tone) => fr.toneEcho.toneNames[tone]).join(fr.toneEcho.curveThen);
  }

  function heardText(asked: ToneEchoQuestion): string {
    switch (asked.kind) {
      case 'tone':
        return asked.syllable;
      case 'pattern':
        return asked.card.pinyin ?? asked.card.term;
      case 'pair':
        return asked.sides[asked.heard].display;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (view.kind !== 'playing' || isShortcut(event) || event.isComposing) {
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
    if (key === ' ' || key === 'r') {
      event.preventDefault();
      play();
    } else if (key === 'l') {
      play(true);
    } else if (question.kind === 'tone' && /^[0-5]$/.test(key) && key !== '0') {
      void answer(Number(key));
    } else if (question.kind === 'tone' && key === '0') {
      void answer(5);
    } else if (question.kind === 'pair' && (key === '1' || key === 'arrowleft')) {
      void answer(0);
    } else if (question.kind === 'pair' && (key === '2' || key === 'arrowright')) {
      void answer(1);
    }
  }

  function onPatternKeydown(event: KeyboardEvent) {
    if (event.isComposing) {
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      play();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      play(true);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section aria-labelledby="tone-echo-title" class="tone-echo">
  <h2 id="tone-echo-title">{title}</h2>

  {#if error !== undefined}
    <p role="alert" class="error">{fr.toneEcho[error]}</p>
  {/if}

  {#if view.kind === 'intro' || view.kind === 'starting'}
    <p>{language === 'zh' ? fr.toneEcho.intro : fr.toneEcho.introEn}</p>
    <p class="help">{fr.toneEcho.noRating}</p>
    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={view.kind === 'starting'}
        onclick={() => void start()}>{fr.toneEcho.start}</button
      >
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{fr.toneEcho.back}</button>
      {/if}
    </div>
    {#if view.kind === 'starting'}
      <p>{fr.toneEcho.starting}</p>
    {/if}
  {:else if view.kind === 'noVoice' || view.kind === 'notEligible'}
    <p>{view.kind === 'noVoice' ? fr.toneEcho.noVoice : fr.toneEcho.notEligible}</p>
    {#if onExit !== undefined}
      <button type="button" onclick={onExit}>{fr.toneEcho.back}</button>
    {/if}
  {:else if view.kind === 'playing' && question !== undefined}
    <div class="toolbar">
      <p class="progress">{format(fr.toneEcho.progress, { position: position + 1, total })}</p>
      <button type="button" onclick={() => void quit()}>{fr.toneEcho.quit}</button>
    </div>

    <div class="stage-card">
      <button
        type="button"
        class="speaker"
        aria-keyshortcuts="R Space"
        aria-label={fr.toneEcho.replay}
        onclick={() => {
          play();
        }}
      >
        <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false">
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          <path class="wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      </button>
      <p class="prompt">
        {question.kind === 'tone'
          ? fr.toneEcho.promptTone
          : question.kind === 'pattern'
            ? fr.toneEcho.promptPattern
            : fr.toneEcho.promptPair}
      </p>
    </div>

    {#if question.kind === 'tone'}
      <div
        class="options tones"
        role="group"
        aria-label={fr.toneEcho.tonesLabel}
        tabindex="-1"
        bind:this={answerZone}
      >
        {#each TONE_KEYS as { tone, digit, mark } (digit)}
          <button
            type="button"
            class="option"
            class:right={feedback !== undefined && question.tone === tone}
            class:wrong={feedback?.outcome === 'wrong' && feedback.given === digit}
            aria-keyshortcuts={digit === 5 ? '5 0' : String(digit)}
            disabled={feedback !== undefined || busy}
            onclick={() => void answer(digit)}
          >
            <kbd aria-hidden="true">{digit === 5 ? '0' : digit}</kbd>
            <span>{fr.toneEcho.toneNames[tone]}</span>
            <span class="tone-{tone} mark-letter" aria-hidden="true">{mark}</span>
          </button>
        {/each}
      </div>
      <p class="help">{fr.toneEcho.keysHelpTone}</p>
    {:else if question.kind === 'pattern'}
      <form
        class="pattern"
        onsubmit={(event) => {
          event.preventDefault();
          if (typed.trim() !== '') {
            void answer(typed);
          }
        }}
      >
        <label for="tone-echo-pattern">{fr.toneEcho.patternLabel}</label>
        <input
          id="tone-echo-pattern"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          maxlength="4"
          bind:value={typed}
          bind:this={answerZone}
          disabled={feedback !== undefined || busy}
          onkeydown={onPatternKeydown}
        />
        <button type="submit" class="primary" disabled={feedback !== undefined || busy}
          >{fr.toneEcho.validate}</button
        >
      </form>
      <p class="help">{fr.toneEcho.keysHelpPattern}</p>
    {:else}
      <div
        class="options pair"
        role="group"
        aria-label={fr.toneEcho.pairLabel}
        tabindex="-1"
        bind:this={answerZone}
      >
        {#each question.sides as side, index (side.text)}
          <button
            type="button"
            class="option big"
            class:right={feedback !== undefined && question.heard === index}
            class:wrong={feedback?.outcome === 'wrong' && feedback.given === index}
            aria-keyshortcuts={index === 0 ? '1 ArrowLeft' : '2 ArrowRight'}
            disabled={feedback !== undefined || busy}
            onclick={() => void answer(index)}
          >
            <kbd aria-hidden="true">{index + 1}</kbd>
            {#if side.language === 'zh'}
              <span lang="zh-CN"><Pinyin pinyin={side.display} /></span>
            {:else}
              <span lang="en">{side.display}</span>
            {/if}
          </button>
        {/each}
      </div>
      <p class="help">{fr.toneEcho.keysHelpPair}</p>
    {/if}

    {#if feedback === undefined}
      <div class="actions">
        <button
          type="button"
          aria-keyshortcuts="L"
          onclick={() => {
            play(true);
          }}><kbd aria-hidden="true">L</kbd> {fr.toneEcho.slow}</button
        >
      </div>
    {:else}
      {@const asked = feedback.question}
      {@const word = questionCard(asked)}
      {@const side = chosenSide(asked, feedback.given)}
      <div
        role="status"
        aria-live="polite"
        class="feedback"
        class:feedback-right={feedback.outcome !== 'wrong'}
        class:feedback-wrong={feedback.outcome === 'wrong'}
      >
        <p class="verdict">
          <span aria-hidden="true">{feedback.outcome === 'wrong' ? '✗' : '✓'}</span>
          {#if feedback.outcome !== 'wrong'}
            {fr.toneEcho.right}
          {:else if side !== undefined}
            {format(fr.toneEcho.wrongHeard, { heard: heardText(asked), chosen: side.display })}
          {:else}
            {format(fr.toneEcho.wrongTone, {
              heard: heardText(asked),
              chosen: toneNames(chosenTones(feedback.given)),
            })}
          {/if}
        </p>
        {#if word !== undefined}
          <p class="word">
            <span lang={lang(word.language)}>{word.term}</span>
            {#if word.pinyin !== undefined}
              · <span lang="zh-CN"><Pinyin pinyin={word.pinyin} /></span>
            {/if}
            · <span>{word.translation}</span>
          </p>
        {:else}
          <p class="help">{fr.toneEcho.practiceOnly}</p>
        {/if}
      </div>

      {#if feedback.outcome === 'wrong'}
        <div class="compare">
          <article class="heard">
            <h3>{fr.toneEcho.heardTitle}</h3>
            <p class="sound" lang={asked.kind === 'pair' ? lang(asked.sides[0].language) : 'zh-CN'}>
              {heardText(asked)}
            </p>
            {#if asked.kind !== 'pair'}
              <ToneCurve tones={heardTones(asked)} variant="heard" />
            {/if}
            <button
              type="button"
              class="primary"
              onclick={() => {
                play();
              }}>{fr.toneEcho.replay}</button
            >
          </article>
          <article class="chosen">
            <h3>{fr.toneEcho.chosenTitle}</h3>
            {#if side !== undefined}
              <p class="sound" lang={lang(side.language)}>{side.display}</p>
              <button type="button" onclick={playChosen}>{fr.toneEcho.listenChosen}</button>
            {:else}
              <ToneCurve tones={chosenTones(feedback.given)} variant="chosen" />
            {/if}
          </article>
        </div>
        {#if asked.kind === 'pattern' && asked.pattern.includes('33')}
          <p class="help">{fr.toneEcho.sandhi}</p>
        {/if}
      {/if}
      <div class="actions">
        <button type="button" id="tone-echo-continue" class="primary" onclick={() => void next()}
          >{fr.toneEcho.continue}</button
        >
      </div>
      <p class="help">{fr.toneEcho.noRating}</p>
    {/if}
  {:else if view.kind === 'summary'}
    <h3>{fr.toneEcho.summaryTitle}</h3>
    <p class="score">
      {format(fr.toneEcho.score, { correct: view.summary.correct, total: view.summary.answered })}
    </p>
    {#if rewards !== undefined}
      <RewardsPanel {rewards} />
    {/if}
    <div class="actions">
      <button type="button" class="primary" onclick={() => void start()}>{fr.toneEcho.again}</button
      >
      {#if onExit !== undefined}
        <button type="button" onclick={onExit}>{fr.toneEcho.back}</button>
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

  .options {
    display: grid;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .options.tones {
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }

  .options.pair {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    text-align: left;
    transition: border-color 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .option.big {
    justify-content: center;
    min-height: 6rem;
    font-size: var(--text-2xl);
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

  .mark-letter {
    margin-left: auto;
    font-size: var(--text-xl);
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

  .pattern {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    margin-bottom: var(--space-2);
  }

  .pattern input {
    width: 6rem;
    min-height: var(--target);
    font-size: var(--text-xl);
    text-align: center;
  }

  .compare {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space-4);
    margin: var(--space-3) 0;
  }

  .compare article {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface);
    text-align: center;
  }

  .compare h3 {
    margin: 0;
    font-size: var(--text-sm);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .compare .heard {
    border: 3px solid var(--jade);
  }

  .compare .heard h3 {
    color: var(--jade-strong);
  }

  .compare .chosen {
    border: 2px dashed var(--ochre);
  }

  .compare .chosen h3 {
    color: var(--ochre);
  }

  .sound {
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: var(--weight-heavy);
  }

  .word {
    margin: 0;
    font-size: var(--text-lg);
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
