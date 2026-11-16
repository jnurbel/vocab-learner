<script lang="ts">
  import { tick } from 'svelte';
  import type { Card } from '../../domain/card';
  import type { GapSentence } from '../../domain/game/gapFill';
  import { hasDetectedError, type WorkshopCheck } from '../../domain/game/sentenceWorkshop';
  import type { FoundError } from '../../domain/sentence/frequentErrors';
  import { format, formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import Pinyin from '../../ui/Pinyin.svelte';
  import RewardsPanel from '../game/RewardsPanel.svelte';
  import type { RewardsSummary } from '../game/sessionRewards';
  import { belongsToInputMethod } from '../typing/imeKeys';
  import type { MiniGameSelection } from './miniGameRecorder';
  import SentenceSource from './SentenceSource.svelte';
  import type { SentenceWorkshopSession, WrittenSentence } from './sentenceWorkshopSession';

  interface Props {
    /** Every word: the workshop keeps the Chinese ones. */
    cards: readonly Card[];
    startSession: (selection: MiniGameSelection) => Promise<SentenceWorkshopSession>;
    onSessionEnd: () => void;
    onExit?: () => void;
    /** Puts the text on the clipboard; the clipboard of the browser by default. */
    copyText?: (text: string) => Promise<void>;
  }

  const {
    cards,
    startSession,
    onSessionEnd,
    onExit,
    copyText = (text) => navigator.clipboard.writeText(text),
  }: Props = $props();

  type Screen =
    | { kind: 'intro' }
    | { kind: 'starting' }
    | { kind: 'notEligible' }
    | { kind: 'writing' }
    | { kind: 'summary'; sentences: readonly WrittenSentence[] };

  const texts = fr.sentenceWorkshop;
  let view = $state<Screen>({ kind: 'intro' });
  let error = $state<'startFailed' | 'saveFailed' | 'keepFailed' | undefined>();
  let session: SentenceWorkshopSession | undefined;
  let word = $state.raw<Card>();
  let words = $state.raw<readonly Card[]>([]);
  let position = $state(0);
  let total = $state(0);
  let sentence = $state('');
  let composing = false;
  let checked = $state.raw<WorkshopCheck>();
  let model = $state.raw<GapSentence>();
  let canKeep = $state(false);
  let kept = $state(false);
  let busy = $state(false);
  let banners = $state(0);
  let copied = $state<'done' | 'failed' | undefined>();
  let rewards = $state.raw<RewardsSummary>();
  let field = $state<HTMLTextAreaElement>();

  async function start() {
    error = undefined;
    view = { kind: 'starting' };
    try {
      session = await startSession({ cards, language: 'zh', labelIds: [] });
    } catch {
      error = 'startFailed';
      view = { kind: 'intro' };
      return;
    }
    if (!session.eligible) {
      view = { kind: 'notEligible' };
      return;
    }
    banners = 0;
    copied = undefined;
    words = session.words;
    view = { kind: 'writing' };
    await showCurrent();
  }

  async function showCurrent() {
    if (session === undefined) {
      return;
    }
    word = session.current;
    position = session.position;
    total = session.total;
    sentence = '';
    checked = undefined;
    model = undefined;
    canKeep = false;
    kept = false;
    if (word === undefined) {
      finish();
      return;
    }
    await tick();
    field?.focus();
  }

  function choose(cardId: string) {
    if (session === undefined) {
      return;
    }
    word = session.chooseWord(cardId);
    checked = undefined;
    model = undefined;
    canKeep = false;
  }

  /** "Vérifier": as often as wanted, without penalty (GAME_DESIGN.md 6.12). */
  function check() {
    if (session === undefined || word === undefined) {
      return;
    }
    checked = session.check(sentence);
    model = session.model();
    canKeep = session.canKeep;
    kept = false;
  }

  async function judge(right: boolean) {
    if (session === undefined || checked === undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    const clean = !hasDetectedError(checked);
    try {
      await session.judge(right);
    } catch {
      error = 'saveFailed';
      return;
    } finally {
      busy = false;
    }
    banners += right && clean ? 1 : 0;
    await showCurrent();
  }

  async function keep() {
    if (session === undefined || busy) {
      return;
    }
    busy = true;
    error = undefined;
    try {
      await session.keepAsExample();
      kept = true;
      canKeep = false;
    } catch {
      error = 'keepFailed';
    } finally {
      busy = false;
    }
  }

  function finish() {
    if (session === undefined) {
      return;
    }
    rewards = session.rewards();
    view = { kind: 'summary', sentences: [...session.sentences] };
    if (session.sentences.length > 0) {
      onSessionEnd();
    }
  }

  function onSentenceKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !belongsToInputMethod(event, composing)) {
      event.preventDefault();
      check();
    }
  }

  function messageOf({ rule, excerpt }: FoundError): string {
    return format(texts.rules[rule], { excerpt });
  }

  /** The learner's sentence cut around the first faulty words, to underline them. */
  function faultyParts(check: WorkshopCheck) {
    const excerpt = check.errors[0]?.excerpt ?? '';
    const at = excerpt === '' ? -1 : check.sentence.indexOf(excerpt);
    return at === -1
      ? undefined
      : {
          before: check.sentence.slice(0, at),
          excerpt,
          after: check.sentence.slice(at + excerpt.length),
        };
  }

  function reviewPrompt(sentences: readonly WrittenSentence[]): string {
    const lines = sentences.map(
      ({ term, sentence: text }, index) => `${String(index + 1)}. (${term}) ${text}`,
    );
    return format(texts.reviewPrompt, { sentences: lines.join('\n') });
  }

  async function copyPrompt(sentences: readonly WrittenSentence[]) {
    try {
      await copyText(reviewPrompt(sentences));
      copied = 'done';
    } catch {
      copied = 'failed';
    }
  }
</script>

<section aria-labelledby="workshop-title" class="workshop">
  <h2 id="workshop-title">{texts.title}</h2>

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
  {:else if view.kind === 'writing' && word !== undefined}
    <div class="toolbar">
      <p class="progress">{format(texts.progress, { position: position + 1, total })}</p>
      <button type="button" onclick={finish}>{texts.quit}</button>
    </div>

    <div class="stage-card">
      <p class="label">{texts.wordLabel}</p>
      <p class="hanzi" lang="zh-CN">{word.term}</p>
      <p class="meaning">
        {#if word.pinyin !== undefined}
          <span lang="zh-CN"><Pinyin pinyin={word.pinyin} /></span> ·
        {/if}
        <span>{word.translation}</span>
      </p>
      <label class="choose">
        <span>{texts.chooseLabel}</span>
        <select
          value={word.id}
          onchange={(event) => {
            choose(event.currentTarget.value);
          }}
        >
          {#each words as option (option.id)}
            <option value={option.id} lang="zh-CN">{option.term}</option>
          {/each}
        </select>
      </label>
    </div>

    <label class="sentence-field">
      <span>{format(texts.sentenceLabel, { term: word.term })}</span>
      <textarea
        lang="zh-CN"
        rows="2"
        maxlength="200"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="workshop-help"
        bind:value={sentence}
        bind:this={field}
        onkeydown={onSentenceKeydown}
        oncompositionstart={() => {
          composing = true;
        }}
        oncompositionend={() => {
          composing = false;
        }}></textarea>
    </label>
    <p class="help" id="workshop-help">{texts.sentenceHelp}</p>
    <div class="actions">
      <button type="button" class="primary" onclick={check}>{texts.check}</button>
    </div>

    <div role="status" aria-live="polite" class="results">
      {#if checked !== undefined}
        {@const detected = hasDetectedError(checked)}
        {@const faulty = faultyParts(checked)}
        {#if !detected && checked.toCheck.length === 0}
          <p class="clean">
            <span aria-hidden="true">✓</span>
            {texts.noErrorFound}
          </p>
        {/if}
        {#if detected}
          <h3>{texts.errorsTitle}</h3>
          {#if faulty !== undefined}
            <p class="written" lang="zh-CN">
              {faulty.before}<u class="faulty">{faulty.excerpt}</u>{faulty.after}
            </p>
          {/if}
          <ul class="errors">
            {#if !checked.containsWord}
              <li>{format(texts.missingWord, { term: word.term })}</li>
            {/if}
            {#if checked.length !== 'ok'}
              <li>{texts[checked.length]}</li>
            {/if}
            {#if checked.foreignCharacters.length > 0}
              <li>{format(texts.foreign, { chars: checked.foreignCharacters.join(' ') })}</li>
            {/if}
            {#each checked.errors as found, index (index)}
              <li>
                {messageOf(found)}
                <span lang="zh-CN"
                  >{format(texts.suggestion, { suggestion: found.suggestion })}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if checked.toCheck.length > 0}
          <h3>{texts.toCheckTitle}</h3>
          <ul class="to-check">
            {#each checked.toCheck as found, index (index)}
              <li>
                {messageOf(found)}
                <span lang="zh-CN"
                  >{format(texts.suggestion, { suggestion: found.suggestion })}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if checked.unknownWords.length > 0}
          <p class="help">
            {format(texts.unknownWords, { words: checked.unknownWords.join(' · ') })}
          </p>
        {/if}
        <h3>{texts.modelTitle}</h3>
        {#if model === undefined}
          <p>{texts.noModel}</p>
        {:else}
          <p class="model" lang="zh-CN">
            {model.parts.before}<mark>{model.parts.term}</mark>{model.parts.after}
          </p>
          {#if model.translation !== undefined}
            <p lang={model.translation.lang}>{model.translation.text}</p>
          {/if}
          {#if model.bank !== undefined}
            <SentenceSource sentence={model.bank} />
          {/if}
        {/if}
        {#if kept}
          <p>{format(texts.kept, { term: word.term })}</p>
        {/if}
      {/if}
    </div>

    {#if checked !== undefined}
      <div class="actions">
        <button type="button" class="primary" disabled={busy} onclick={() => void judge(true)}
          >{texts.judgeRight}</button
        >
        <button type="button" disabled={busy} onclick={() => void judge(false)}
          >{texts.judgeWrong}</button
        >
        {#if canKeep}
          <button type="button" disabled={busy} onclick={() => void keep()}>{texts.keep}</button>
        {/if}
      </div>
    {/if}
  {:else if view.kind === 'summary'}
    <h3>{texts.summaryTitle}</h3>
    <p>{formatCount(texts.summaryCount, view.sentences.length)}</p>
    {#if banners > 0}
      <p class="banner" role="status">{texts.banner}</p>
    {/if}
    {#if rewards !== undefined}
      <RewardsPanel {rewards} />
    {/if}
    {#if view.sentences.length > 0}
      <p>{texts.reviewIntro}</p>
      <pre class="prompt" lang="fr">{reviewPrompt(view.sentences)}</pre>
      <button
        type="button"
        onclick={() => void copyPrompt(view.kind === 'summary' ? view.sentences : [])}
        >{texts.reviewCopy}</button
      >
      {#if copied === 'done'}
        <p role="status">{texts.reviewCopied}</p>
      {:else if copied === 'failed'}
        <p role="alert" class="error">{texts.reviewFailed}</p>
      {/if}
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
    padding: var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-raised);
    text-align: center;
  }

  .stage-card p {
    margin: 0;
  }

  .label {
    color: var(--ink-soft);
    font-size: var(--text-sm);
  }

  .hanzi {
    font-family: var(--font-hanzi);
    font-size: var(--text-2xl);
  }

  .meaning {
    font-size: var(--text-lg);
  }

  .choose,
  .sentence-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-weight: var(--weight-bold);
  }

  .choose select {
    min-height: var(--target-lg);
    font-family: var(--font-hanzi);
  }

  .sentence-field textarea {
    min-height: calc(2 * var(--target-lg));
    font-family: var(--font-hanzi);
    font-size: var(--text-xl);
  }

  .help {
    color: var(--ink-soft);
    font-size: var(--text-sm);
  }

  .results {
    margin: var(--space-3) 0;
  }

  .results h3 {
    margin: var(--space-3) 0 var(--space-1);
    font-size: var(--text-md);
  }

  .clean {
    color: var(--jade-strong);
    font-weight: var(--weight-bold);
  }

  .written,
  .model {
    font-family: var(--font-hanzi);
    font-size: var(--text-xl);
  }

  .faulty {
    text-decoration-color: var(--ochre);
    text-decoration-thickness: 3px;
    text-underline-offset: 4px;
  }

  .errors li {
    color: var(--ink);
  }

  mark {
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--jade-soft);
    color: var(--jade-strong);
    font-weight: var(--weight-heavy);
  }

  .banner {
    color: var(--jade-strong);
    font-weight: var(--weight-heavy);
  }

  .prompt {
    max-width: 70ch;
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    white-space: pre-wrap;
    font-family: inherit;
  }
</style>
