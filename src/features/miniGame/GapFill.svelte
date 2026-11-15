<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Card, Language } from '../../domain/card';
  import type { GapFillQuestion } from '../../domain/game/gapFill';
  import { MINI_GAME_CONFIG } from '../../domain/game/miniGameConfig';
  import type { Outcome } from '../../domain/srs/reviewState';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import Pinyin from '../../ui/Pinyin.svelte';
  import RewardsPanel from '../game/RewardsPanel.svelte';
  import type { RewardsSummary } from '../game/sessionRewards';
  import { belongsToInputMethod } from '../typing/imeKeys';
  import type { GapFillSession } from './gapFillSession';
  import { isOwnKeyTarget, isShortcut } from './gameKeys';
  import type { MiniGameSelection, MiniGameSummary } from './miniGameRecorder';
  import SentenceSource from './SentenceSource.svelte';

  interface Props {
    /** Every word: the game keeps those of the language with a sentence. */
    cards: readonly Card[];
    language: Language;
    /** Words imposed by a step session of the path; every eligible word otherwise. */
    cardIds?: readonly string[];
    speaker: Speaker;
    speechRate: number;
    startSession: (selection: MiniGameSelection) => Promise<GapFillSession>;
    onSessionEnd: () => void;
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
    question: GapFillQuestion;
    /** What the learner chose or typed; none for "Je ne sais pas". */
    given?: string;
    sameSound: boolean;
  }

  type Screen =
    | { kind: 'intro' }
    | { kind: 'starting' }
    | { kind: 'notEligible' }
    | { kind: 'playing' }
    | { kind: 'summary'; summary: MiniGameSummary };

  const texts = fr.gapFill;
  let view = $state<Screen>({ kind: 'intro' });
  let error = $state<'startFailed' | 'saveFailed' | undefined>();
  let session: GapFillSession | undefined;
  let question = $state.raw<GapFillQuestion>();
  let position = $state(0);
  let total = $state(0);
  let feedback = $state.raw<Feedback>();
  let busy = $state(false);
  let hints = $state(0);
  let typed = $state('');
  let composing = false;
  let translationOpen = $state(false);
  let rewards = $state.raw<RewardsSummary>();
  let answerElement = $state<HTMLElement>();
  let voice = $state(false);
  let advanceTimer: ReturnType<typeof setTimeout> | undefined;

  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');

  onDestroy(() => {
    clearTimeout(advanceTimer);
    speaker.cancel();
  });

  async function start() {
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
    question = session.current;
    position = session.position;
    total = session.total;
    feedback = undefined;
    hints = 0;
    typed = '';
    translationOpen = false;
    if (question === undefined) {
      finish();
      return;
    }
    await tick();
    answerElement?.focus();
  }

  /** The whole sentence, read once the answer is given (GAME_DESIGN.md 6.10). */
  function play(): void {
    const asked = feedback?.question;
    if (asked === undefined || !voice) {
      return;
    }
    speaker.unlock();
    speaker.speak(asked.sentence.text, asked.target.language, { rate: speechRate }).catch(() => {
      voice = false;
    });
  }

  async function answer(choice: Card | 'unknown' | { typed: string }) {
    if (session === undefined || question === undefined || feedback !== undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    const asked = question;
    try {
      if (typeof choice === 'object' && 'typed' in choice) {
        const recorded = await session.answerTyped(choice.typed, hints);
        feedback = {
          outcome: recorded.outcome,
          question: asked,
          ...(choice.typed.trim() === '' ? {} : { given: choice.typed.trim() }),
          sameSound: recorded.comparison?.reason === 'sameSoundOtherCharacter',
        };
      } else {
        const recorded = await session.answerChoice(choice, hints);
        feedback = {
          outcome: recorded.outcome,
          question: asked,
          ...(choice === 'unknown' ? {} : { given: choice.term }),
          sameSound: false,
        };
      }
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    play();
    if (feedback.outcome !== 'wrong') {
      advanceTimer = setTimeout(() => void next(), MINI_GAME_CONFIG.feedbackCorrectMs);
    }
    await tick();
    document.getElementById('gap-fill-continue')?.focus();
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

  function onTypedKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !belongsToInputMethod(event, composing)) {
      event.preventDefault();
      void answer({ typed });
    }
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
    if (event.key.toLowerCase() === 't') {
      translationOpen = !translationOpen;
    } else if (event.key === '0' && question.mode === 'choice') {
      void answer('unknown');
    } else if (/^[1-9]$/.test(event.key) && chosen !== undefined) {
      void answer(chosen);
    }
  }

  /** As many boxes as characters at level 1 (GAME_DESIGN.md 6.10), a plain gap otherwise. */
  function gapOf(asked: GapFillQuestion): string {
    if (asked.difficulty === 1 && asked.target.language === 'zh') {
      return '□'.repeat(Array.from(asked.sentence.parts.term).length);
    }
    return asked.target.language === 'zh' ? '＿＿' : '_____';
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section aria-labelledby="gap-fill-title" class="gap-fill">
  <h2 id="gap-fill-title">{texts.title}</h2>

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
    {@const target = question.target}
    {@const sentence = question.sentence}
    <div class="toolbar">
      <p class="progress">{format(texts.progress, { position: position + 1, total })}</p>
      <button type="button" onclick={() => void quit()}>{texts.quit}</button>
    </div>

    <div class="stage-card">
      {#if feedback === undefined}
        <p class="sentence" lang={lang(target.language)}>
          {sentence.parts.before}<span class="gap" role="img" aria-label={texts.gap}
            >{gapOf(question)}</span
          >{sentence.parts.after}
        </p>
      {/if}
      {#if sentence.translation !== undefined}
        <details bind:open={translationOpen}>
          <summary aria-keyshortcuts="T">{texts.showTranslation}</summary>
          <p>
            <span class="translation-label"
              >{sentence.translation.lang === 'fr' ? texts.translationFr : texts.translationEn} :</span
            >
            <span lang={sentence.translation.lang}>{sentence.translation.text}</span>
          </p>
        </details>
      {/if}
      {#if feedback === undefined && hints > 0}
        <p class="hint">
          {#if target.pinyin !== undefined && target.language === 'zh'}
            <span lang="zh-CN">{format(texts.hintPinyin, { pinyin: target.pinyin })}</span>
          {/if}
          {#if hints > 1}
            <span lang={lang(target.language)}
              >{format(texts.hintFirst, { char: Array.from(target.term)[0] ?? '' })}</span
            >
          {/if}
        </p>
      {/if}
      <p class="help">{question.mode === 'choice' ? texts.keysHelp : texts.typedHelp}</p>
    </div>

    {#if question.mode === 'choice'}
      <div
        class="options"
        role="group"
        aria-label={texts.optionsLabel}
        tabindex="-1"
        bind:this={answerElement}
      >
        {#each question.options as option, index (option.id)}
          {@const isTarget = option.id === target.id}
          {@const isChosen = feedback?.given === option.term}
          <button
            type="button"
            class="option"
            class:right={feedback !== undefined && isTarget}
            class:wrong={feedback !== undefined && isChosen && !isTarget}
            aria-keyshortcuts={String(index + 1)}
            disabled={feedback !== undefined || busy}
            onclick={() => void answer(option)}
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
    {:else if feedback === undefined}
      <label class="typed">
        <span>{texts.typedLabel}</span>
        <input
          type="text"
          lang={lang(target.language)}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="100"
          bind:value={typed}
          bind:this={answerElement}
          onkeydown={onTypedKeydown}
          oncompositionstart={() => {
            composing = true;
          }}
          oncompositionend={() => {
            composing = false;
          }}
        />
      </label>
    {/if}

    {#if feedback === undefined}
      <div class="actions">
        {#if question.mode === 'typed'}
          <button
            type="button"
            class="primary"
            disabled={busy}
            onclick={() => void answer({ typed })}>{texts.validate}</button
          >
        {/if}
        <button type="button" disabled={hints >= 2} onclick={() => (hints += 1)}
          >{texts.hint}</button
        >
        <button
          type="button"
          class="unknown"
          aria-keyshortcuts={question.mode === 'choice' ? '0' : undefined}
          disabled={busy}
          onclick={() => void answer(question?.mode === 'typed' ? { typed: '' } : 'unknown')}
          >{#if question.mode === 'choice'}<kbd aria-hidden="true">0</kbd>
          {/if}{texts.unknown}</button
        >
      </div>
    {:else}
      {@const asked = feedback.question}
      {@const word = asked.target}
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
            ? format(texts.wrong, { term: word.term })
            : feedback.outcome === 'almost'
              ? format(texts.almost, { term: word.term })
              : texts.right}
        </p>
        <p class="sentence" lang={lang(word.language)}>
          {asked.sentence.parts.before}<mark>{asked.sentence.parts.term}</mark>{asked.sentence.parts
            .after}
        </p>
        <p class="word">
          <span lang={lang(word.language)}>{word.term}</span>
          {#if word.pinyin !== undefined}
            · <span lang="zh-CN"><Pinyin pinyin={word.pinyin} /></span>
          {/if}
          · <span>{word.translation}</span>
        </p>
        {#if asked.sentence.translation !== undefined}
          <p lang={asked.sentence.translation.lang}>{asked.sentence.translation.text}</p>
        {/if}
        {#if feedback.outcome === 'wrong'}
          <p>
            {feedback.sameSound && feedback.given !== undefined
              ? format(texts.sameSound, { given: feedback.given, term: word.term })
              : feedback.given === undefined
                ? texts.unknownChosen
                : format(texts.chose, { term: feedback.given })}
          </p>
        {/if}
        {#if asked.sentence.bank !== undefined}
          <SentenceSource sentence={asked.sentence.bank} />
        {/if}
      </div>
      <div class="actions">
        {#if voice}
          <button type="button" onclick={play}>{texts.replay}</button>
        {/if}
        <button type="button" id="gap-fill-continue" class="primary" onclick={() => void next()}
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

  .sentence {
    font-size: var(--text-xl);
    line-height: 1.5;
  }

  .sentence[lang='zh-CN'] {
    font-family: var(--font-hanzi);
    font-size: var(--text-2xl);
  }

  .gap {
    padding: 0 var(--space-1);
    border-bottom: 2px solid var(--jade);
    color: var(--ink-soft);
    letter-spacing: 0.1em;
  }

  details summary {
    min-height: var(--target-lg);
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    color: var(--jade-strong);
    font-weight: var(--weight-bold);
  }

  .translation-label {
    color: var(--ink-soft);
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

  .typed {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
    font-weight: var(--weight-bold);
  }

  .typed input {
    min-height: var(--target-lg);
    font-size: var(--text-xl);
  }

  .typed input[lang='zh-CN'] {
    font-family: var(--font-hanzi);
  }

  .word {
    margin: 0;
    font-size: var(--text-lg);
  }

  .help,
  .hint {
    color: var(--ink-soft);
    font-size: var(--text-sm);
  }

  .hint {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    font-size: var(--text-md);
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
