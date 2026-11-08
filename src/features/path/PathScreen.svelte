<script lang="ts">
  import type { Language } from '../../domain/card';
  import type { PathStep } from '../../domain/progressRecords';
  import type { BuiltInStep, ExerciseStep, LaunchPurpose } from './pathLaunch';
  import type { StepView } from '../../domain/path/pathStatus';
  import { format, formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import type { LoadedPath, PlacementOutcome } from './pathSession';

  interface Props {
    labelName: string;
    /** The languages in which the label has words; a tab for each when there are two. */
    languages: readonly Language[];
    /** The language shown first. */
    language?: Language;
    loadPath: (language: Language) => Promise<LoadedPath>;
    speaker: Speaker;
    /** The steps validated before the session just played: the new ones are celebrated. */
    validatedBefore?: readonly PathStep[];
    /** The result of the placement test just taken, if any. */
    placement?: PlacementOutcome;
    /** Opens the existing screen of a step (flashcards, ListenMeaning, typed word, dictation). */
    onStartStep: (step: BuiltInStep, cardIds: readonly string[], purpose: LaunchPurpose) => void;
    /**
     * Opens the exercise of the recognize step (bridgeMatch, then toneEcho or close pairs) or of
     * the sentences step (sentenceListen, sentenceShuffle) on these words of the label, in the
     * language of the path. `purpose` tells a step session (the words not right yet, least
     * remembered first) from a placement test (10 words drawn at random, scored when the learner
     * comes back to the path). The voice is already unlocked when it is called. The answers only
     * need to be recorded with their exercise for the path to advance.
     */
    onLaunchExercise: (
      step: ExerciseStep,
      cardIds: readonly string[],
      purpose: LaunchPurpose,
    ) => void;
    onFinalChallenge: (path: LoadedPath) => void;
    /** Goes to the word list, where examples are added. */
    onAddExamples: () => void;
  }

  const {
    labelName,
    languages,
    language: initialLanguage = 'zh',
    loadPath,
    speaker,
    validatedBefore,
    placement,
    onStartStep,
    onLaunchExercise,
    onFinalChallenge,
    onAddExamples,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let language = $state<Language>(initialLanguage);
  let path = $state.raw<LoadedPath>();
  let failed = $state(false);
  let request = 0;

  $effect(() => {
    void load(language);
  });

  async function load(shown: Language) {
    const current = (request += 1);
    failed = false;
    try {
      const loaded = await loadPath(shown);
      if (current === request) {
        path = loaded;
      }
    } catch {
      if (current === request) {
        failed = true;
      }
    }
  }

  const steps = $derived(path?.view.steps ?? []);
  const current = $derived(steps.find(({ status }) => status === 'current'));
  const validatedCount = $derived(steps.filter(({ status }) => status === 'validated').length);
  const justValidated = $derived(
    validatedBefore === undefined
      ? []
      : steps.filter(
          ({ step, status }) => status === 'validated' && !validatedBefore.includes(step),
        ),
  );
  const complete = $derived(path !== undefined && current === undefined);
  const score = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

  const nameOf = (step: PathStep) => fr.path.steps[step].name;
  const titleOf = (view: StepView, index: number) =>
    format(fr.path.stepTitle, { number: index + 1, name: nameOf(view.step) });

  function counterOf(view: StepView): string {
    if (view.step === 'finalChallenge') {
      return view.done > 0
        ? format(fr.path.bestScore, { score: score.format(view.done) })
        : fr.path.noScore;
    }
    return format(fr.path.wordsDone, { done: view.done, total: view.total });
  }

  /** Runs in the click: a phone speaks only when unlocked during the gesture itself. */
  function launch(view: StepView, purpose: LaunchPurpose) {
    speaker.unlock();
    if (path === undefined) {
      return;
    }
    const cardIds =
      purpose === 'stepSession' ? path.stepWords(view.step) : path.placementWords(view.step);
    if (view.step === 'recognize' || view.step === 'sentences') {
      onLaunchExercise(view.step, cardIds, purpose);
    } else if (view.step !== 'finalChallenge') {
      onStartStep(view.step, cardIds, purpose);
    }
  }

  function openFinalChallenge() {
    speaker.unlock();
    if (path !== undefined) {
      onFinalChallenge(path);
    }
  }

  const langAttribute = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');
</script>

<section class="path" aria-labelledby="path-title">
  <header class="path-header">
    <span class="eyebrow">{fr.path.eyebrow}</span>
    <h2 id="path-title">{labelName}</h2>
    {#if path !== undefined}
      <p class="help">{format(fr.path.summary, { validated: validatedCount })}</p>
    {/if}
  </header>

  {#if languages.length > 1}
    <div class="tabs" role="tablist" aria-label={fr.path.languageTabs}>
      {#each languages as code (code)}
        <button
          type="button"
          role="tab"
          aria-selected={language === code}
          lang={langAttribute(code)}
          onclick={() => {
            language = code;
          }}>{fr.languages[code]}</button
        >
      {/each}
    </div>
  {/if}

  {#if failed}
    <p role="alert" class="error">{fr.path.loadFailed}</p>
  {:else if path === undefined}
    <p role="status">{fr.path.loading}</p>
  {:else}
    {#if justValidated.length > 0 || placement !== undefined}
      <div class="notice" role="status">
        {#each justValidated as view (view.step)}
          <p class="celebration">{format(fr.path.stepValidated, { name: nameOf(view.step) })}</p>
        {/each}
        {#if justValidated.length > 0 && current !== undefined}
          <p>{format(fr.path.nextStep, { name: nameOf(current.step) })}</p>
        {/if}
        {#if placement !== undefined}
          <p>
            {format(placement.validated ? fr.path.placementPassed : fr.path.placementNotYet, {
              correct: placement.correct,
              total: placement.total,
            })}
          </p>
        {/if}
      </div>
    {/if}

    <div class="layout">
      <ol class="trail" aria-label={fr.path.stepsLabel}>
        {#each steps as view, index (view.step)}
          <li
            class="stone {view.status}"
            class:lit={justValidated.some(({ step }) => step === view.step)}
          >
            <span class="node" aria-hidden="true"
              >{view.status === 'validated' ? '✓' : index + 1}</span
            >
            <div class="stone-text">
              <h3>{titleOf(view, index)}</h3>
              {#if view.status === 'skipped'}
                <p class="help">{fr.path.sentencesSkipped}</p>
                <button type="button" class="link" onclick={onAddExamples}
                  >{fr.path.addExamples}</button
                >
              {:else}
                <p class="help">{fr.path.steps[view.step].description}</p>
                <p class="counter">{counterOf(view)}</p>
              {/if}
            </div>
            <span class="tag">{fr.path.status[view.status]}</span>
          </li>
        {/each}
      </ol>

      <div class="side">
        {#if current !== undefined}
          <section class="card next" aria-labelledby="path-current-title">
            <span class="eyebrow">{fr.path.currentEyebrow}</span>
            <h3 id="path-current-title">
              {titleOf(current, steps.indexOf(current))}
            </h3>
            <p>{fr.path.steps[current.step].description}</p>
            {#if current.step === 'finalChallenge'}
              <p class="help">{fr.path.finalChallengeHelp}</p>
              <button type="button" class="primary" onclick={openFinalChallenge}
                >{fr.path.finalChallenge}</button
              >
            {:else}
              <p class="help">
                {format(fr.path.criterion, { required: current.required, total: current.total })}
                {formatCount(fr.path.wordsLeft, Math.max(0, current.required - current.done))}
              </p>
              <div class="actions">
                <button
                  type="button"
                  class="primary"
                  onclick={() => {
                    launch(current, 'stepSession');
                  }}>{fr.path.continue}</button
                >
                {#if current.step !== 'discover'}
                  <button
                    type="button"
                    aria-describedby="path-placement-help"
                    onclick={() => {
                      launch(current, 'placementTest');
                    }}>{fr.path.placement}</button
                  >
                  <p class="help" id="path-placement-help">{fr.path.placementHelp}</p>
                {/if}
              </div>
            {/if}
          </section>
        {:else if complete}
          <section class="card done" aria-labelledby="path-done-title">
            <h3 id="path-done-title">{fr.path.completed}</h3>
          </section>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .path {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .path-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .path-header h2 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: var(--weight-heavy);
  }

  .path-header p {
    margin: 0;
  }

  .eyebrow {
    color: var(--jade-strong);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .tabs {
    display: flex;
    gap: var(--space-2);
  }

  .tabs button {
    min-height: var(--target);
    padding: var(--space-1) var(--space-4);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--ink);
    font-weight: var(--weight-bold);
  }

  .tabs button[aria-selected='true'] {
    border-color: var(--jade);
    background: var(--jade-soft);
    color: var(--jade-strong);
  }

  .notice {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--line);
    border-left: 4px solid var(--jade);
    border-radius: var(--radius-md);
    background: var(--jade-soft);
    color: var(--ink);
  }

  .notice p {
    margin: 0;
  }

  .celebration {
    font-weight: var(--weight-heavy);
    color: var(--jade-strong);
  }

  .layout {
    display: grid;
    gap: var(--space-4);
  }

  .trail {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .stone {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
  }

  .node {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border: 2px dashed var(--line-strong);
    border-radius: 50%;
    background: var(--surface);
    color: var(--muted);
    font-size: var(--text-lg);
    font-weight: var(--weight-heavy);
  }

  .validated .node {
    border: 0;
    background: var(--jade);
    color: var(--on-jade);
  }

  .current .node {
    border: 4px solid var(--jade);
    background: var(--jade-soft);
    color: var(--jade-strong);
    box-shadow: 0 0 0 6px var(--jade-soft);
  }

  .lit .node {
    box-shadow: 0 0 0 6px var(--plant-heart);
    animation: appear var(--duration) ease-out;
  }

  .stone-text {
    min-width: 0;
  }

  .stone-text h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--weight-heavy);
  }

  .stone-text p {
    margin: 0;
  }

  .counter {
    color: var(--ink-soft);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
  }

  .locked,
  .skipped {
    color: var(--ink-soft);
  }

  .tag {
    margin-left: auto;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--track);
    color: var(--ink-soft);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    white-space: nowrap;
  }

  .validated .tag {
    background: var(--jade-soft);
    color: var(--jade-strong);
  }

  .current .tag {
    background: var(--ink);
    color: var(--on-ink);
  }

  .link {
    min-height: var(--target);
    padding: 0;
    border: 0;
    background: none;
    color: var(--jade-strong);
    font-weight: var(--weight-bold);
    text-decoration: underline;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    background: var(--surface-2);
  }

  .card h3,
  .card p {
    margin: 0;
  }

  .next {
    border-color: var(--jade);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .actions .help {
    flex-basis: 100%;
    margin: 0;
  }

  .actions button,
  .next > button {
    min-height: var(--target-lg);
  }

  /* The stones zigzag like a trail on a computer, as in docs/ui/mockups/Parcours.dc.html. */
  @media (min-width: 900px) {
    .layout {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      align-items: start;
    }

    .stone:nth-child(4n + 2),
    .stone:nth-child(4n) {
      padding-left: var(--space-7);
    }

    .stone:nth-child(4n + 3) {
      padding-left: calc(2 * var(--space-7));
    }
  }
</style>
