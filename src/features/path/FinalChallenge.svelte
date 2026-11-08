<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Card, Language } from '../../domain/card';
  import { CHALLENGE_SECTIONS, type ChallengeSection } from '../../domain/path/finalChallenge';
  import { PATH_CONFIG } from '../../domain/path/pathConfig';
  import { format, formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import type {
    ChallengeItem,
    FinalChallengeResult,
    FinalChallengeSession,
  } from './finalChallengeSession';

  interface Props {
    labelName: string;
    speaker: Speaker;
    /** Composes today's challenge on the label; nothing is stored before the first answer. */
    startChallenge: () => Promise<FinalChallengeSession>;
    /** "Revoir ces mots": a short practice on the words missed. */
    onReview: (words: readonly Card[]) => void;
    /** Back to the path, after the result or when leaving. */
    onBack: () => void;
    /** Called once the challenge is scored and stored. */
    onFinished?: () => void;
  }

  const { labelName, speaker, startChallenge, onReview, onBack, onFinished }: Props = $props();

  /** The dictation reads each word twice, slower first (GAME_DESIGN.md 5.4). */
  const DICTATION_RATES = [0.85, 1] as const;
  const COST_OF: Readonly<Record<ChallengeSection, number>> = {
    listening: PATH_CONFIG.itemCostSec.listenMeaning,
    dictation: PATH_CONFIG.itemCostSec.listenType,
    translation: PATH_CONFIG.itemCostSec.typeEcho,
  };

  type View = 'loading' | 'intro' | 'question' | 'result' | 'failed';
  let view = $state<View>('loading');
  let error = $state<'startFailed' | 'saveFailed'>();
  let session: FinalChallengeSession | undefined;
  let item = $state.raw<ChallengeItem>();
  let position = $state(0);
  let total = $state(0);
  let minutes = $state(0);
  let voice = $state(true);
  let replaysLeft = $state(0);
  let typed = $state('');
  let busy = $state(false);
  let result = $state.raw<FinalChallengeResult>();
  let answerZone = $state<HTMLElement>();
  const score = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');
  const sectionTitle = (section: ChallengeSection) => fr.finalChallenge.sections[section];

  onMount(() => {
    void prepare();
  });

  onDestroy(() => {
    speaker.cancel();
  });

  async function prepare() {
    try {
      const prepared = await startChallenge();
      voice = await speaker.hasVoice(prepared.items[0]?.card.language ?? 'zh');
      session = prepared;
      total = prepared.total;
      minutes = Math.max(
        1,
        Math.ceil(prepared.items.reduce((sum, { section }) => sum + COST_OF[section], 0) / 60),
      );
      view = 'intro';
    } catch {
      view = 'failed';
      error = 'startFailed';
    }
  }

  /** Runs in the click on Start: the first word is read before any await, as phones require. */
  function begin() {
    speaker.unlock();
    view = 'question';
    void show();
  }

  async function show() {
    if (session === undefined) {
      return;
    }
    item = session.current;
    position = session.position;
    typed = '';
    if (item === undefined) {
      await finish();
      return;
    }
    replaysLeft = PATH_CONFIG.finalChallengeReplaysPerWord;
    play(item);
    await tick();
    answerZone?.focus();
  }

  function play(asked: ChallengeItem) {
    if (!voice || asked.section === 'translation') {
      return;
    }
    const { term, language } = asked.card;
    if (asked.section === 'listening') {
      speaker.speak(term, language).catch(() => undefined);
      return;
    }
    const [slow, normal] = DICTATION_RATES;
    speaker
      .speak(term, language, { rate: slow })
      .then(() => speaker.speak(term, language, { rate: normal }))
      .catch(() => undefined);
  }

  function replay() {
    speaker.unlock();
    if (item === undefined || replaysLeft === 0) {
      return;
    }
    replaysLeft -= 1;
    const { term, language } = item.card;
    speaker.speak(term, language).catch(() => undefined);
  }

  async function answer(give: (current: FinalChallengeSession) => Promise<void>) {
    if (session === undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    speaker.unlock();
    try {
      await give(session);
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    await show();
  }

  function submitTyped() {
    const given = typed;
    if (given.trim() === '') {
      return;
    }
    void answer((current) => current.type(given));
  }

  async function finish() {
    if (session === undefined) {
      return;
    }
    speaker.cancel();
    try {
      result = await session.finish();
    } catch {
      error = 'saveFailed';
      return;
    }
    view = 'result';
    onFinished?.();
  }

  async function quit() {
    speaker.cancel();
    await session?.quit();
    onBack();
  }

  function listen(word: Card) {
    speaker.unlock();
    speaker.speak(word.term, word.language).catch(() => undefined);
  }

  function review() {
    if (result !== undefined) {
      onReview(result.missed.map(({ card }) => card));
    }
  }
</script>

<section class="challenge" aria-labelledby="challenge-title">
  <header>
    <span class="eyebrow">{format(fr.finalChallenge.eyebrow, { name: labelName })}</span>
    <h2 id="challenge-title">{fr.finalChallenge.title}</h2>
  </header>

  {#if error !== undefined}
    <p role="alert" class="error">{fr.finalChallenge[error]}</p>
  {/if}

  {#if view === 'loading'}
    <p role="status">{fr.path.loading}</p>
  {:else if view === 'failed'}
    <button type="button" onclick={onBack}>{fr.finalChallenge.backToPath}</button>
  {:else if view === 'intro'}
    {#if total < 2}
      <p>{fr.finalChallenge.notEnoughWords}</p>
      <button type="button" onclick={onBack}>{fr.finalChallenge.backToPath}</button>
    {:else}
      <p>{formatCount(fr.finalChallenge.intro, total, { minutes })}</p>
      <div class="actions">
        <button type="button" class="primary" onclick={begin}>{fr.finalChallenge.start}</button>
        <button type="button" onclick={onBack}>{fr.finalChallenge.backToPath}</button>
      </div>
    {/if}
  {:else if view === 'question' && item !== undefined}
    <div class="toolbar">
      <h3>{sectionTitle(item.section)}</h3>
      <p class="progress">
        {format(fr.finalChallenge.progress, { position: position + 1, total })}
      </p>
      <progress max={total} value={position} aria-hidden="true"></progress>
    </div>

    <div class="question" tabindex="-1" bind:this={answerZone}>
      {#if item.section === 'translation'}
        <p>{fr.finalChallenge.translationPrompt}</p>
        <p class="meaning" data-testid="challenge-meaning">{item.card.translation}</p>
      {:else}
        <p>
          {item.section === 'listening'
            ? fr.finalChallenge.listeningPrompt
            : fr.finalChallenge.dictationPrompt}
        </p>
        {#if voice}
          <button type="button" onclick={replay} disabled={replaysLeft === 0}>
            {fr.finalChallenge.replay}
          </button>
          <span class="help">
            {replaysLeft === 0
              ? fr.finalChallenge.noReplayLeft
              : formatCount(fr.finalChallenge.replaysLeft, replaysLeft)}
          </span>
        {:else}
          <p class="help">{fr.finalChallenge.noVoice}</p>
          <p class="term" lang={lang(item.card.language)} data-testid="challenge-written">
            {item.card.term}
          </p>
        {/if}
      {/if}

      {#if item.section === 'listening'}
        {@const { question } = item}
        <div class="options" role="group" aria-label={fr.finalChallenge.optionsLabel}>
          {#each question.options as option (option.id)}
            <button
              type="button"
              class="option"
              disabled={busy}
              onclick={() => void answer((current) => current.choose(option))}
              >{option.translation}</button
            >
          {/each}
        </div>
      {:else}
        <form
          class="field"
          onsubmit={(event) => {
            event.preventDefault();
            submitTyped();
          }}
        >
          <label for="challenge-answer">{fr.finalChallenge.answerLabel}</label>
          <input
            id="challenge-answer"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            lang={lang(item.card.language)}
            maxlength="200"
            bind:value={typed}
          />
          <button type="submit" class="primary" disabled={busy}>{fr.finalChallenge.validate}</button
          >
        </form>
      {/if}
    </div>

    <div class="actions">
      <button type="button" disabled={busy} onclick={() => void answer((current) => current.skip())}
        >{fr.finalChallenge.dontKnow}</button
      >
      <button type="button" onclick={() => void quit()}>{fr.finalChallenge.quit}</button>
      <p class="help">{fr.finalChallenge.quitHelp}</p>
    </div>
  {:else if view === 'result' && result !== undefined}
    {@const { score: scored, missed } = result}
    <div class="result" class:passed={scored.passed}>
      <div class="score-card">
        <h3>{scored.passed ? fr.finalChallenge.resultPassed : fr.finalChallenge.resultNotYet}</h3>
        <p class="score" aria-hidden="true">
          <strong>{score.format(scored.score20)}</strong>
          <span>{fr.finalChallenge.outOf}</span>
        </p>
        <p class="visually-hidden">
          {format(fr.finalChallenge.scoreLabel, { score: score.format(scored.score20) })}
        </p>
        <p class="help">
          {format(fr.finalChallenge.passMark, { pass: PATH_CONFIG.finalChallengePassScore20 })}
        </p>
        <ul class="sections">
          {#each CHALLENGE_SECTIONS as section (section)}
            {@const part = scored.sections[section]}
            {#if part.total > 0}
              <li>
                <span>{sectionTitle(section)}</span>
                <span class="section-score"
                  >{format(fr.finalChallenge.sectionScore, { ...part })}</span
                >
                <meter min="0" max={part.total} value={part.correct} aria-hidden="true"></meter>
              </li>
            {/if}
          {/each}
        </ul>
        {#if scored.passed}
          <p class="banner-name">{format(fr.finalChallenge.banner, { name: labelName })}</p>
        {/if}
      </div>

      <div class="missed">
        <h3>{formatCount(fr.finalChallenge.missedTitle, missed.length)}</h3>
        {#if missed.length === 0}
          <p class="help">{fr.finalChallenge.noMistake}</p>
        {:else}
          <ul>
            {#each missed as { card, section } (card.id)}
              <li>
                <span class="term" lang={lang(card.language)}>{card.term}</span>
                {#if card.pinyin !== undefined}
                  <span lang="zh-CN">{card.pinyin}</span>
                {/if}
                <span>{card.translation}</span>
                <span class="tag">{sectionTitle(section)}</span>
                <button
                  type="button"
                  class="listen"
                  aria-label={format(fr.finalChallenge.listen, { term: card.term })}
                  onclick={() => {
                    listen(card);
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
                  </svg>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="actions">
          <button type="button" onclick={onBack}>{fr.finalChallenge.backToPath}</button>
          {#if missed.length > 0}
            <button type="button" class="primary" onclick={review}
              >{formatCount(fr.finalChallenge.review, missed.length)}</button
            >
          {/if}
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .challenge {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--text-xl);
    font-weight: var(--weight-heavy);
  }

  .eyebrow {
    color: var(--jade-strong);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }

  .progress {
    margin-left: auto;
    font-weight: var(--weight-bold);
  }

  .toolbar progress {
    flex-basis: 100%;
    height: 10px;
    accent-color: var(--jade);
  }

  .question {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }

  .meaning,
  .term {
    font-size: var(--text-2xl);
    font-weight: var(--weight-heavy);
  }

  .term:lang(zh-CN) {
    font-family: var(--font-hanzi);
  }

  .options {
    display: grid;
    gap: var(--space-2);
  }

  .option {
    min-height: var(--target-lg);
    text-align: left;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .actions .help {
    flex-basis: 100%;
  }

  .actions button {
    min-height: var(--target);
  }

  .result {
    display: grid;
    gap: var(--space-4);
  }

  .score-card,
  .missed {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }

  .passed .score-card {
    border-color: var(--jade);
  }

  .score {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .score strong {
    font-size: 4rem;
    line-height: 1;
    font-weight: var(--weight-heavy);
  }

  .score span {
    color: var(--muted);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }

  .sections,
  .missed ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sections li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-1);
  }

  .sections meter {
    grid-column: 1 / -1;
    width: 100%;
    height: 10px;
  }

  .section-score {
    font-weight: var(--weight-bold);
  }

  .banner-name {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--jade);
    color: var(--on-jade);
    font-weight: var(--weight-heavy);
    text-align: center;
  }

  .missed li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }

  .missed .term {
    font-size: var(--text-xl);
  }

  .tag {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--ochre-soft);
    color: var(--ochre);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }

  .listen {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--target);
    height: var(--target);
    margin-left: auto;
    padding: 0;
    color: var(--jade-strong);
  }

  /* Read by screen readers only: the big score above is hidden from them. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (min-width: 900px) {
    .result {
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
      align-items: start;
    }
  }
</style>
