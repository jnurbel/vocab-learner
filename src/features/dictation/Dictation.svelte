<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Card, Language } from '../../domain/card';
  import { compareAnswer } from '../../domain/dictation/answerCompare';
  import type { DiffPart } from '../../domain/dictation/characterDiff';
  import {
    DICTATION_DELAYS,
    DICTATION_RATES,
    DICTATION_WORD_COUNT,
    dictationPlan,
    type DictationDelay,
    type DictationSpeed,
  } from '../../domain/dictation/dictationPlan';
  import type { Label } from '../../domain/label';
  import type { PinyinGenerator } from '../../domain/pinyinGeneration';
  import type { Outcome } from '../../domain/srs/reviewState';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import Pinyin from '../../ui/Pinyin.svelte';
  import { belongsToInputMethod } from '../typing/imeKeys';
  import AnswerDiff from './AnswerDiff.svelte';
  import {
    DictationPlayer,
    pauseWhenHidden,
    type PlayerSnapshot,
    type PlayerTimers,
  } from './dictationPlayer';
  import type { DictationSelection, DictationSession } from './dictationSession';

  type AnswerMode = 'keyboard' | 'paper';

  interface Props {
    cards: readonly Card[];
    labels: readonly Label[];
    speaker: Speaker;
    startSession: (selection: DictationSelection) => Promise<DictationSession>;
    loadPinyin: () => Promise<PinyinGenerator>;
    /** Called once a dictation with at least one answer ends. */
    onSessionEnd: () => void;
    /** Keyboard on a computer; paper suits a phone better. */
    defaultMode?: AnswerMode;
    /** Seed of the random order; a new one for each dictation. */
    newSeed?: () => string;
    timers?: PlayerTimers;
  }

  const {
    cards,
    labels,
    speaker,
    startSession,
    loadPinyin,
    onSessionEnd,
    defaultMode = 'keyboard',
    newSeed = () => crypto.randomUUID(),
    timers,
  }: Props = $props();

  const LANGUAGES: readonly Language[] = ['zh', 'en'];
  const SPEEDS = Object.keys(DICTATION_RATES) as DictationSpeed[];
  const MODES: readonly AnswerMode[] = ['keyboard', 'paper'];
  const SELF_MARKS = ['correct', 'almost', 'wrong'] as const;
  type SelfMark = (typeof SELF_MARKS)[number];

  // The start screen.
  let language = $state<Language>('zh');
  let labelIds = $state<string[]>([]);
  let wordCount = $state<number>(DICTATION_WORD_COUNT.default);
  let shuffle = $state(false);
  let readTwice = $state(false);
  let delay = $state('5');
  let speed = $state<DictationSpeed>('normal');
  // svelte-ignore state_referenced_locally
  let mode = $state<AnswerMode>(defaultMode);

  let view = $state<'setup' | 'starting' | 'running' | 'correction' | 'summary'>('setup');
  let error = $state<'noWords' | 'startFailed' | 'saveFailed'>();

  // The dictation under way; raw state, replaced as a whole.
  let words = $state.raw<Card[]>([]);
  let runMode = $state<AnswerMode>('keyboard');
  let snapshot = $state.raw<PlayerSnapshot>();
  let voice = $state<'available' | 'missing'>('available');
  let results = $state.raw<{ card: Card; outcome: Outcome }[]>([]);
  let session: DictationSession | undefined;
  let player: DictationPlayer | undefined;
  let release: (() => void) | undefined;

  // The keyboard answer.
  interface Feedback {
    card: Card;
    outcome: Outcome;
    diff?: DiffPart[];
    given?: string;
    sameSound: boolean;
  }
  let typed = $state('');
  let composing = false;
  let hintShown = $state(false);
  let feedback = $state.raw<Feedback>();
  let busy = $state(false);

  // The dictation on paper.
  let delayMs = $state<number>();
  let marks = $state<Record<string, SelfMark>>({});
  let field = $state<HTMLInputElement>();
  let continueButton = $state<HTMLButtonElement>();

  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');
  const current = $derived(snapshot === undefined ? undefined : words[snapshot.index]);
  const allMarked = $derived(words.every((word) => marks[word.id] !== undefined));
  const written = $derived(voice === 'missing' || snapshot?.audioFailed === true);
  const isRight = (outcome: Outcome) => outcome === 'correct' || outcome === 'correctWithHint';
  const score = $derived(results.filter(({ outcome }) => isRight(outcome)).length);
  const mistakes = $derived(results.filter(({ outcome }) => !isRight(outcome)));

  function delayOf(value: string): DictationDelay {
    return DICTATION_DELAYS.find((option) => String(option) === value) ?? 5;
  }

  async function start(chosen?: readonly Card[]) {
    error = undefined;
    const plan = dictationPlan(chosen ?? cards, {
      language,
      labelIds: chosen === undefined ? labelIds : [],
      wordCount: chosen === undefined ? wordCount : DICTATION_WORD_COUNT.max,
      shuffle,
      seed: newSeed(),
      readTwice,
      delay: delayOf(delay),
      speed,
    });
    if (plan.words.length === 0) {
      error = 'noWords';
      return;
    }
    view = 'starting';
    try {
      session = await startSession({ language, labelIds: [...labelIds], words: plan.words });
      voice = (await speaker.hasVoice(language)) ? 'available' : 'missing';
    } catch {
      error = 'startFailed';
      view = 'setup';
      return;
    }
    words = plan.words;
    runMode = mode;
    results = [];
    marks = {};
    delayMs = plan.delayMs;
    resetAnswer();
    const reader = new DictationPlayer(
      plan.words.map((word) => ({ text: word.term, language: word.language })),
      { ...plan, delayMs: runMode === 'keyboard' ? undefined : plan.delayMs },
      { speaker, ...(timers === undefined ? {} : { timers }) },
    );
    player = reader;
    snapshot = reader.snapshot;
    const unsubscribe = reader.subscribe((next) => {
      snapshot = next;
      if (next.status === 'finished') {
        void readingFinished();
      }
    });
    const unwatch = pauseWhenHidden(reader, document);
    release = () => {
      unsubscribe();
      unwatch();
      reader.stop();
    };
    view = 'running';
    reader.play();
    await focusAnswer();
  }

  function resetAnswer() {
    typed = '';
    composing = false;
    hintShown = false;
    feedback = undefined;
  }

  async function focusAnswer() {
    await tick();
    field?.focus();
  }

  function replay(slow = false) {
    if (!written) {
      player?.repeat({ slow });
    }
  }

  async function submit() {
    if (current === undefined || busy || feedback !== undefined || typed.trim() === '') {
      return;
    }
    const card = current;
    const given = typed;
    await answer(card, async () => {
      const comparison = await compareAnswer(
        { language: card.language, expected: card.term, given },
        { loadPinyin },
      );
      const outcome: Outcome =
        comparison.outcome === 'correct' && hintShown ? 'correctWithHint' : comparison.outcome;
      return {
        card,
        outcome,
        diff: comparison.diff,
        given,
        sameSound: comparison.reason === 'sameSoundOtherCharacter',
      };
    });
  }

  async function dontKnow() {
    if (current === undefined || busy || feedback !== undefined) {
      return;
    }
    const card = current;
    await answer(card, () => Promise.resolve({ card, outcome: 'wrong', sameSound: false }));
  }

  /** Stores the answer, then shows the feedback; a mistake reads the word once more. */
  async function answer(card: Card, check: () => Promise<Feedback>) {
    if (session === undefined) {
      return;
    }
    busy = true;
    error = undefined;
    try {
      const checked = await check();
      await session.record(card, checked.outcome, {
        hintsUsed: hintShown ? 1 : 0,
        ...(checked.given === undefined ? {} : { answer: checked.given }),
      });
      results = [...results, { card, outcome: checked.outcome }];
      feedback = checked;
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    if (!isRight(feedback.outcome)) {
      replay();
    }
    await tick();
    continueButton?.focus();
  }

  async function next() {
    resetAnswer();
    player?.next();
    if (view === 'running') {
      await focusAnswer();
    }
  }

  async function readingFinished() {
    if (view !== 'running') {
      return;
    }
    if (runMode === 'paper') {
      view = 'correction';
      release?.();
      release = undefined;
    } else {
      await finish();
    }
  }

  async function finish() {
    view = 'summary';
    release?.();
    release = undefined;
    await session?.end();
    if (results.length > 0) {
      onSessionEnd();
    }
  }

  /** Each word gets the learner's own mark: right, half right or wrong. */
  async function submitCorrection() {
    if (session === undefined || busy || !allMarked) {
      return;
    }
    busy = true;
    error = undefined;
    try {
      // After a failed save, only the words not stored yet are sent again.
      for (const word of words.slice(results.length)) {
        const outcome = marks[word.id] ?? 'wrong';
        await session.record(word, outcome);
        results = [...results, { card: word, outcome }];
      }
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    await finish();
  }

  function listen(card: Card) {
    speaker.speak(card.term, card.language).catch(() => undefined);
  }

  function restart() {
    view = 'setup';
    session = undefined;
    player = undefined;
    words = [];
  }

  onDestroy(() => {
    release?.();
  });

  function onFieldKeydown(event: KeyboardEvent) {
    if (belongsToInputMethod(event, composing)) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      replay(event.key === 'ArrowDown');
    }
  }

  /** Fields and controls keep their own keys: Space activates a focused button. */
  function isOwnKeyTarget(target: EventTarget | null, key: string): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.closest('input, textarea, select, [contenteditable="true"]') !== null) {
      return true;
    }
    return (key === ' ' || key === 'Enter') && target.closest('button, a') !== null;
  }

  function onKeydown(event: KeyboardEvent) {
    if (
      view !== 'running' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isOwnKeyTarget(event.target, event.key)
    ) {
      return;
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const paper = runMode === 'paper';
    if (key === 'r' || key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      replay(key === 'ArrowDown');
    } else if (paper && key === ' ') {
      event.preventDefault();
      player?.togglePause();
    } else if (paper && key === 'ArrowLeft') {
      player?.previous();
    } else if (paper && key === 'ArrowRight') {
      player?.next();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet wordCard(card: Card)}
  <p class="term" lang={lang(card.language)}>{card.term}</p>
  {#if card.pinyin !== undefined}
    <p lang="zh-CN"><Pinyin pinyin={card.pinyin} /></p>
  {/if}
  <p>{card.translation}</p>
{/snippet}

{#snippet writtenPrompt(card: Card)}
  <p class="notice">
    {snapshot?.audioFailed === true && voice === 'available'
      ? fr.dictation.audioError
      : fr.dictation.writtenPrompt[card.language]}
  </p>
  {#if card.language === 'zh' && card.pinyin !== undefined}
    <p class="prompt" lang="zh-CN"><Pinyin pinyin={card.pinyin} /></p>
  {:else}
    <p class="prompt">{card.translation}</p>
  {/if}
{/snippet}

<section aria-labelledby="dictation-title" class="dictation">
  <h2 id="dictation-title">{fr.dictation.title}</h2>

  {#if error !== undefined}
    <p role="alert" class="error">{fr.dictation[error]}</p>
  {/if}

  {#if view === 'setup' || view === 'starting'}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      <fieldset>
        <legend>{fr.dictation.languageLegend}</legend>
        {#each LANGUAGES as code (code)}
          <label class="choice">
            <input type="radio" name="dictation-language" value={code} bind:group={language} />
            {fr.languages[code]}
          </label>
        {/each}
      </fieldset>
      {#if labels.length > 0}
        <fieldset>
          <legend>{fr.dictation.labelsLegend}</legend>
          {#each labels as label (label.id)}
            <label class="choice">
              <input type="checkbox" value={label.id} bind:group={labelIds} />
              {label.name}
            </label>
          {/each}
        </fieldset>
      {/if}
      <fieldset>
        <legend>{fr.dictation.optionsLegend}</legend>
        <p>
          <label for="dictation-count">{fr.dictation.wordCount}</label>
          <input
            id="dictation-count"
            type="number"
            min={DICTATION_WORD_COUNT.min}
            max={DICTATION_WORD_COUNT.max}
            bind:value={wordCount}
          />
        </p>
        <label class="choice"
          ><input type="checkbox" bind:checked={shuffle} /> {fr.dictation.shuffle}</label
        >
        <label class="choice"
          ><input type="checkbox" bind:checked={readTwice} /> {fr.dictation.readTwice}</label
        >
        <p>
          <label for="dictation-delay">{fr.dictation.delay}</label>
          <select id="dictation-delay" bind:value={delay}>
            {#each DICTATION_DELAYS as option (option)}
              <option value={String(option)}>{fr.dictation.delays[option]}</option>
            {/each}
          </select>
        </p>
      </fieldset>
      <fieldset>
        <legend>{fr.dictation.speedLegend}</legend>
        {#each SPEEDS as option (option)}
          <label class="choice">
            <input type="radio" name="dictation-speed" value={option} bind:group={speed} />
            {fr.dictation.speeds[option]}
          </label>
        {/each}
      </fieldset>
      <fieldset>
        <legend>{fr.dictation.modeLegend}</legend>
        {#each MODES as option (option)}
          <label class="choice">
            <input type="radio" name="dictation-mode" value={option} bind:group={mode} />
            {fr.dictation.modes[option]}
          </label>
        {/each}
      </fieldset>
      <button type="submit" disabled={view === 'starting'}>{fr.dictation.start}</button>
      {#if view === 'starting'}
        <p>{fr.dictation.starting}</p>
      {/if}
    </form>
  {:else if view === 'running' && snapshot !== undefined && current !== undefined}
    <p role="status" class="progress">
      {format(fr.dictation.wordNumber, { position: snapshot.index + 1, total: snapshot.total })}
    </p>

    {#if written}
      {@render writtenPrompt(current)}
    {/if}

    {#if runMode === 'keyboard'}
      <p class="field">
        <label for="dictation-answer">{fr.dictation.answerLabel}</label>
        <input
          id="dictation-answer"
          bind:this={field}
          bind:value={typed}
          lang={lang(current.language)}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="200"
          readonly={feedback !== undefined}
          aria-describedby="dictation-answer-help"
          oncompositionstart={() => {
            composing = true;
          }}
          oncompositionend={() => {
            composing = false;
          }}
          onkeydown={onFieldKeydown}
        />
        <span id="dictation-answer-help" class="help">{fr.dictation.answerHelp}</span>
      </p>

      {#if hintShown && feedback === undefined}
        {#if current.language === 'zh' && current.pinyin !== undefined}
          <p lang="zh-CN"><Pinyin pinyin={current.pinyin} /></p>
        {:else}
          <p>
            {format(fr.dictation.hintLetters, {
              letter: Array.from(current.term)[0] ?? '',
              count: Array.from(current.term.replace(/\s/g, '')).length,
            })}
          </p>
        {/if}
        <p class="help">{fr.dictation.hintUsed}</p>
      {/if}

      <div aria-live="polite">
        {#if feedback !== undefined}
          <div class="feedback feedback-{isRight(feedback.outcome) ? 'right' : feedback.outcome}">
            <p class="verdict">
              <span aria-hidden="true">{isRight(feedback.outcome) ? '✓' : '✗'}</span>
              {#if isRight(feedback.outcome)}
                {fr.dictation.correct}
              {:else if feedback.outcome === 'almost'}
                {format(fr.dictation.almost, { term: feedback.card.term })}
              {:else}
                {format(fr.dictation.wrong, { term: feedback.card.term })}
              {/if}
            </p>
            {#if feedback.sameSound && feedback.given !== undefined}
              <p>
                {format(fr.dictation.sameSound, {
                  given: feedback.given.trim(),
                  expected: feedback.card.term,
                })}
              </p>
            {/if}
            {#if !isRight(feedback.outcome) && feedback.diff !== undefined}
              <AnswerDiff diff={feedback.diff} language={feedback.card.language} />
            {/if}
            {@render wordCard(feedback.card)}
          </div>
        {/if}
      </div>

      <div class="actions">
        {#if feedback !== undefined}
          <button type="button" bind:this={continueButton} onclick={next}
            >{fr.dictation.continue}</button
          >
        {/if}
        {#if !written}
          <button
            type="button"
            aria-keyshortcuts="ArrowUp"
            onclick={() => {
              replay();
            }}>{fr.dictation.replay}</button
          >
          <button
            type="button"
            aria-keyshortcuts="ArrowDown"
            onclick={() => {
              replay(true);
            }}>{fr.dictation.slow}</button
          >
        {/if}
        {#if feedback === undefined}
          {#if !hintShown}
            <button
              type="button"
              onclick={() => {
                hintShown = true;
                field?.focus();
              }}>{fr.dictation.hint}</button
            >
          {/if}
          <button type="button" disabled={busy} onclick={dontKnow}>{fr.dictation.dontKnow}</button>
        {/if}
        <button type="button" onclick={finish}>{fr.dictation.quit}</button>
      </div>
      <p class="help">{fr.dictation.keyboardHelp.keyboard}</p>
    {:else}
      {#if snapshot.status === 'paused'}
        <p class="state">{fr.dictation.paused}</p>
      {:else if snapshot.status === 'speaking'}
        <p class="state">{fr.dictation.listening}</p>
      {:else if snapshot.remainingMs !== undefined && delayMs !== undefined}
        <p class="state" aria-hidden="true">
          {format(fr.dictation.countdown, { seconds: Math.ceil(snapshot.remainingMs / 1_000) })}
        </p>
        <progress
          aria-label={fr.dictation.countdownLabel}
          max={delayMs}
          value={delayMs - snapshot.remainingMs}
        ></progress>
      {:else}
        <p class="state">{fr.dictation.writeNow}</p>
      {/if}

      <div class="actions">
        {#if snapshot.status === 'paused'}
          <button type="button" aria-keyshortcuts="Space" onclick={() => player?.resume()}
            >{fr.dictation.resume}</button
          >
        {:else}
          <button type="button" aria-keyshortcuts="Space" onclick={() => player?.pause()}
            >{fr.dictation.pause}</button
          >
        {/if}
        {#if !written}
          <button
            type="button"
            aria-keyshortcuts="R ArrowUp"
            onclick={() => {
              replay();
            }}>{fr.dictation.replay}</button
          >
          <button
            type="button"
            aria-keyshortcuts="ArrowDown"
            onclick={() => {
              replay(true);
            }}>{fr.dictation.slow}</button
          >
        {/if}
        <button type="button" aria-keyshortcuts="ArrowLeft" onclick={() => player?.previous()}
          >{fr.dictation.previous}</button
        >
        <button type="button" aria-keyshortcuts="ArrowRight" onclick={() => player?.next()}
          >{fr.dictation.next}</button
        >
        <button type="button" onclick={() => player?.stop()}>{fr.dictation.finishPaper}</button>
      </div>
      <p class="help">{fr.dictation.keyboardHelp.paper}</p>
    {/if}
  {:else if view === 'correction'}
    <h3>{fr.dictation.correctionTitle}</h3>
    <p>{fr.dictation.correctionHelp}</p>
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void submitCorrection();
      }}
    >
      <ol class="correction">
        {#each words as word, index (word.id)}
          <li>
            <fieldset>
              <legend
                >{format(fr.dictation.markLegend, { position: index + 1 })}
                <span class="term-small" lang={lang(word.language)}>{word.term}</span></legend
              >
              {#if word.pinyin !== undefined}
                <p lang="zh-CN"><Pinyin pinyin={word.pinyin} /></p>
              {/if}
              <p>{word.translation}</p>
              {#each SELF_MARKS as mark (mark)}
                <label class="choice">
                  <input
                    type="radio"
                    name="dictation-mark-{word.id}"
                    value={mark}
                    bind:group={marks[word.id]}
                  />
                  {fr.dictation.selfMarks[mark]}
                </label>
              {/each}
            </fieldset>
          </li>
        {/each}
      </ol>
      <button type="submit" disabled={busy || !allMarked}>{fr.dictation.submitCorrection}</button>
    </form>
  {:else if view === 'summary'}
    <h3>{fr.dictation.summaryTitle}</h3>
    <p class="score">{format(fr.dictation.score, { score, total: results.length })}</p>
    {#if mistakes.length === 0}
      <p>{fr.dictation.noMistakes}</p>
    {:else}
      <h4 id="dictation-mistakes">{fr.dictation.mistakesTitle}</h4>
      <ul aria-labelledby="dictation-mistakes" class="mistakes">
        {#each mistakes as mistake (mistake.card.id)}
          <li>
            <span class="term-small" lang={lang(mistake.card.language)}>{mistake.card.term}</span>
            {#if mistake.card.pinyin !== undefined}
              <span lang="zh-CN"><Pinyin pinyin={mistake.card.pinyin} /></span>
            {/if}
            <span>{mistake.card.translation}</span>
            {#if voice === 'available'}
              <button
                type="button"
                onclick={() => {
                  listen(mistake.card);
                }}>{fr.dictation.listen}</button
              >
            {/if}
          </li>
        {/each}
      </ul>
      <button type="button" onclick={() => start(mistakes.map(({ card }) => card))}
        >{fr.dictation.retryMissed}</button
      >
    {/if}
    <button type="button" onclick={restart}>{fr.dictation.restart}</button>
  {/if}
</section>

<style>
  fieldset {
    border: 1px solid currentColor;
    margin: 0 0 1rem;
  }

  .choice {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
    margin-right: 1rem;
    min-height: 44px;
  }

  button,
  input,
  select {
    min-height: 44px;
  }

  button {
    min-width: 44px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin: 1rem 0;
  }

  .progress,
  .score {
    font-variant-numeric: tabular-nums;
    font-weight: bold;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field input {
    font-size: 2rem;
  }

  .field input:focus-visible,
  button:focus-visible {
    outline: 3px solid Highlight;
    outline-offset: 2px;
  }

  .term {
    font-size: 2.5rem;
    margin: 0;
  }

  .prompt {
    font-size: 2rem;
  }

  .feedback {
    border: 2px solid currentColor;
    border-radius: 0.5rem;
    padding: 1rem;
    margin: 1rem 0;
    animation: appear 200ms ease-out;
  }

  .feedback-right {
    border-color: #2e7d32;
  }

  .feedback-almost,
  .feedback-wrong {
    border-color: #8a4b00;
  }

  .verdict {
    font-weight: bold;
  }

  .mistakes {
    padding-left: 1rem;
  }

  .mistakes li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .state {
    font-size: 1.25rem;
  }

  progress {
    width: 100%;
    height: 1rem;
  }

  .correction {
    padding-left: 1rem;
  }

  .term-small {
    font-size: 1.5rem;
  }

  .notice,
  .help {
    font-size: 0.9rem;
  }

  .error {
    color: var(--ochre);
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .feedback {
      animation: none;
    }
  }
</style>
