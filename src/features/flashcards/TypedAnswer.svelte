<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Card, Language } from '../../domain/card';
  import { compareAnswer } from '../../domain/dictation/answerCompare';
  import type { DiffPart } from '../../domain/dictation/characterDiff';
  import { compareMeaning } from '../../domain/meaning/meaningCompare';
  import type { PinyinGenerator } from '../../domain/pinyinGeneration';
  import type { Outcome } from '../../domain/srs/reviewState';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import Pinyin from '../../ui/Pinyin.svelte';
  import AnswerDiff from '../dictation/AnswerDiff.svelte';
  import { belongsToInputMethod } from '../typing/imeKeys';
  import type { TypedExercise } from './flashcardSession';

  interface Props {
    card: Card;
    exercise: TypedExercise;
    /** A voice can read the word. */
    canReplay: boolean;
    onReplay: () => void;
    /** pinyin-pro is large: loaded only to explain a wrong answer in hanzi. */
    loadPinyin: () => Promise<PinyinGenerator>;
    /** Stores the checked answer; `answer` is absent after "Je ne sais pas". */
    onAnswer: (outcome: Outcome, details: { hintsUsed: number; answer?: string }) => Promise<void>;
    /** "J'avais bon": the last typed meaning counts as right. */
    onAccept: () => Promise<void>;
    onContinue: () => void;
  }

  const { card, exercise, canReplay, onReplay, loadPinyin, onAnswer, onAccept, onContinue }: Props =
    $props();

  interface Feedback {
    outcome: Outcome;
    /** What the learner typed; absent after "Je ne sais pas". */
    given?: string;
    /** The stored sense a typed meaning was recognised as. */
    sense?: string;
    diff?: DiffPart[];
    sameSound: boolean;
    accepted: boolean;
  }

  let typed = $state('');
  let composing = false;
  let hintShown = $state(false);
  let feedback = $state.raw<Feedback>();
  let busy = $state(false);
  let error = $state<'saveFailed'>();
  let field = $state<HTMLInputElement>();
  let continueButton = $state<HTMLButtonElement>();

  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');
  const isRight = (outcome: Outcome) => outcome === 'correct' || outcome === 'correctWithHint';
  const meaning = $derived(exercise === 'typeMeaning');
  const answerLang = $derived(meaning ? 'fr' : lang(card.language));
  /** Typing the word: hearing it first would give the answer away. */
  const replayShown = $derived(canReplay && (meaning || feedback !== undefined));
  const canAccept = $derived(
    meaning && feedback?.given !== undefined && !feedback.accepted && !isRight(feedback.outcome),
  );
  /** What the learner was looking for, in a sentence. */
  const expected = $derived(meaning ? card.translation : card.term);

  onMount(() => {
    field?.focus();
  });

  async function check(given: string): Promise<Feedback> {
    if (meaning) {
      const { outcome, sense } = compareMeaning(given, card.translation);
      return {
        outcome,
        given,
        ...(sense === undefined ? {} : { sense }),
        sameSound: false,
        accepted: false,
      };
    }
    const comparison = await compareAnswer(
      { language: card.language, expected: card.term, given },
      { loadPinyin },
    );
    return {
      outcome:
        comparison.outcome === 'correct' && hintShown ? 'correctWithHint' : comparison.outcome,
      given,
      diff: comparison.diff,
      sameSound: comparison.reason === 'sameSoundOtherCharacter',
      accepted: false,
    };
  }

  async function submit() {
    if (busy || feedback !== undefined || typed.trim() === '') {
      return;
    }
    const given = typed;
    await settle(() => check(given));
  }

  async function dontKnow() {
    if (busy || feedback !== undefined) {
      return;
    }
    await settle(() => Promise.resolve({ outcome: 'wrong', sameSound: false, accepted: false }));
  }

  /** Stores the answer, then shows the feedback and reads the word: the echo. */
  async function settle(checking: () => Promise<Feedback>) {
    busy = true;
    error = undefined;
    try {
      const checked = await checking();
      await onAnswer(checked.outcome, {
        hintsUsed: hintShown ? 1 : 0,
        ...(checked.given === undefined ? {} : { answer: checked.given }),
      });
      feedback = checked;
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    if (canReplay) {
      onReplay();
    }
    await tick();
    continueButton?.focus();
  }

  async function accept() {
    if (feedback === undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    try {
      await onAccept();
      feedback = { ...feedback, outcome: 'correct', accepted: true };
    } catch {
      error = 'saveFailed';
    } finally {
      busy = false;
    }
    await tick();
    continueButton?.focus();
  }

  function onFieldKeydown(event: KeyboardEvent) {
    if (belongsToInputMethod(event, composing)) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    } else if (event.key === 'ArrowUp' && replayShown) {
      event.preventDefault();
      onReplay();
    }
  }
</script>

<div class="typed">
  {#if error !== undefined}
    <p role="alert" class="error">{fr.flashcards[error]}</p>
  {/if}

  <div class="card">
    {#if meaning}
      <p class="term" lang={lang(card.language)}>{card.term}</p>
      <p>{fr.typed.prompt.typeMeaning}</p>
    {:else}
      <p class="translation" lang="fr">{card.translation}</p>
      <p>{fr.typed.prompt.typeWord[card.language]}</p>
    {/if}
  </div>

  <p class="field">
    <label for="typed-answer">{fr.typed.answerLabel}</label>
    <input
      id="typed-answer"
      bind:this={field}
      bind:value={typed}
      lang={answerLang}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      maxlength="200"
      readonly={feedback !== undefined}
      aria-describedby="typed-answer-help"
      oncompositionstart={() => {
        composing = true;
      }}
      oncompositionend={() => {
        composing = false;
      }}
      onkeydown={onFieldKeydown}
    />
    <span id="typed-answer-help" class="help">{fr.typed.answerHelp}</span>
  </p>

  {#if hintShown && feedback === undefined}
    {#if card.language === 'zh' && card.pinyin !== undefined}
      <p lang="zh-CN"><Pinyin pinyin={card.pinyin} /></p>
    {:else}
      <p>
        {format(fr.dictation.hintLetters, {
          letter: Array.from(card.term)[0] ?? '',
          count: Array.from(card.term.replace(/\s/g, '')).length,
        })}
      </p>
    {/if}
    <p class="help">{fr.dictation.hintUsed}</p>
  {/if}

  <div aria-live="polite">
    {#if feedback !== undefined}
      {@const right = isRight(feedback.outcome)}
      <div
        class="feedback feedback-{right ? 'right' : feedback.outcome}"
        data-testid="typed-feedback"
      >
        <p class="verdict">
          <span aria-hidden="true">{right ? '✓' : '✗'}</span>
          {#if right}
            {fr.dictation.correct}
          {:else if feedback.outcome === 'almost'}
            {format(fr.dictation.almost, { term: feedback.sense ?? expected })}
          {:else}
            {format(fr.dictation.wrong, { term: expected })}
          {/if}
        </p>
        {#if feedback.accepted}
          <p>{fr.typed.accepted}</p>
        {/if}
        {#if feedback.sense !== undefined && right}
          <p>{format(fr.typed.recognized, { sense: feedback.sense })}</p>
        {/if}
        {#if feedback.sameSound && feedback.given !== undefined}
          <p>
            {format(fr.dictation.sameSound, { given: feedback.given.trim(), expected: card.term })}
          </p>
        {/if}
        {#if !right && feedback.diff !== undefined}
          <AnswerDiff diff={feedback.diff} language={card.language} />
        {/if}
        <p class="term" lang={lang(card.language)}>{card.term}</p>
        {#if card.pinyin !== undefined}
          <p lang="zh-CN"><Pinyin pinyin={card.pinyin} /></p>
        {/if}
        <p lang="fr">{card.translation}</p>
      </div>
    {/if}
  </div>

  <div class="actions">
    {#if feedback !== undefined}
      <button type="button" bind:this={continueButton} onclick={onContinue}
        >{fr.dictation.continue}</button
      >
      {#if canAccept}
        <button type="button" disabled={busy} aria-describedby="typed-accept-help" onclick={accept}
          >{fr.typed.accept}</button
        >
        <span id="typed-accept-help" class="help">{fr.typed.acceptHelp}</span>
      {/if}
    {/if}
    {#if replayShown}
      <button type="button" aria-keyshortcuts="ArrowUp" onclick={onReplay}
        >{fr.flashcards.replay}</button
      >
    {/if}
    {#if feedback === undefined}
      {#if !meaning && !hintShown}
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
  </div>
  <p class="help">{fr.typed.keyboardHelp}</p>
</div>

<style>
  button,
  input {
    min-height: 44px;
  }

  button {
    min-width: 44px;
  }

  .card {
    border: 2px solid currentColor;
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin: 1rem 0;
    text-align: center;
  }

  .term {
    font-size: 2.5rem;
    margin: 0;
  }

  .translation {
    font-size: 1.75rem;
    margin: 0;
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

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin: 1rem 0;
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

  .help {
    font-size: 0.9rem;
  }

  .error {
    color: #b00020;
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
