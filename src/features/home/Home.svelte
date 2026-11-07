<script lang="ts">
  import type { Language } from '../../domain/card';
  import type { ExamForecast } from '../../domain/exam/forecastExamPlan';
  import type { Label } from '../../domain/label';
  import type { LocalDay } from '../../domain/srs/localDay';
  import { format, formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { Speaker } from '../../services/tts/speaker';
  import type { FocusLabelView, HomeView } from './homeView';

  interface Props {
    /** The tab shown first. */
    language?: Language;
    loadView: (language: Language) => Promise<HomeView>;
    speaker: Speaker;
    /** Opens today's flashcards of the language. */
    onStart: (language: Language) => void;
    /** Free practice on these labels (every word of the language when empty). */
    onPractice: (language: Language, labelIds: readonly string[]) => void;
    /** Goes to the word entry. */
    onAddWords: () => void;
    onUndoUnpin: (label: Label) => Promise<void>;
    onIntensiveChange: (label: Label, intensive: boolean) => Promise<void>;
    /** Opens the path of a pinned label in the language shown (GAME_DESIGN.md 8.4). */
    onOpenPath?: (label: Label, language: Language) => void;
  }

  const {
    language: initialLanguage = 'zh',
    loadView,
    speaker,
    onStart,
    onPractice,
    onAddWords,
    onUndoUnpin,
    onIntensiveChange,
    onOpenPath,
  }: Props = $props();

  const LANGUAGES: readonly Language[] = ['zh', 'en'];

  // svelte-ignore state_referenced_locally
  let language = $state<Language>(initialLanguage);
  let view = $state.raw<HomeView>();
  let failed = $state(false);
  /** Only the latest request is shown, should an earlier one answer late. */
  let request = 0;
  const tabs: Partial<Record<Language, HTMLButtonElement>> = {};

  $effect(() => {
    void load(language);
  });

  async function load(shown: Language) {
    const current = (request += 1);
    failed = false;
    try {
      const loaded = await loadView(shown);
      if (current === request) {
        view = loaded;
      }
    } catch {
      if (current === request) {
        failed = true;
      }
    }
  }

  function choose(next: Language) {
    language = next;
    tabs[next]?.focus();
  }

  function onTabKey(event: KeyboardEvent) {
    const index = LANGUAGES.indexOf(language);
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: LANGUAGES.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    const next = LANGUAGES[(target + LANGUAGES.length) % LANGUAGES.length];
    if (next !== undefined) {
      choose(next);
    }
  }

  // Local days are calendar dates: formatted in UTC so that no time zone shifts them.
  const shortDate = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const longDate = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const dayOf = (day: LocalDay) => new Date(`${day}T00:00:00Z`);

  function countdown(forecast: ExamForecast, examDate: LocalDay): string {
    const date = shortDate.format(dayOf(examDate));
    if (forecast.daysLeft < 0) {
      return format(fr.home.countdownPast, { date });
    }
    if (forecast.daysLeft === 0) {
      return format(fr.home.countdownToday, { date });
    }
    if (forecast.daysLeft === 1) {
      return format(fr.home.countdownTomorrow, { date });
    }
    return formatCount(fr.home.countdown, forecast.daysLeft, { date });
  }

  function statusText(forecast: ExamForecast): string {
    switch (forecast.status) {
      case 'examDay':
        return fr.home.status.examDay;
      case 'shortNotice':
        return fr.home.status.shortNotice;
      case 'overloaded':
        return format(fr.home.status.overloaded, {
          newTotal: forecast.coveredNew + forecast.uncoveredNew,
          days: forecast.daysLeft,
          perDay: forecast.days[0]?.newCount ?? 0,
          covered: forecast.coveredNew,
        });
      case 'tight':
        return format(fr.home.status.tight, { minutes: forecast.maxMinutesPerDay });
      case 'past':
        return '';
      default:
        return onTrackText(forecast);
    }
  }

  function onTrackText(forecast: ExamForecast): string {
    if (forecast.total > 0 && forecast.masteredNow === forecast.total) {
      return fr.home.status.allMastered;
    }
    return forecast.fullyMasteredOn === undefined
      ? format(fr.home.status.onTrackCount, {
          expected: forecast.expectedMasteredAtExam,
          total: forecast.total,
        })
      : format(fr.home.status.onTrackDay, {
          day: longDate.format(dayOf(forecast.fullyMasteredOn)),
        });
  }

  const percentOf = (mastered: number, total: number) =>
    total === 0 ? 0 : Math.round((mastered / total) * 100);

  const isIntensive = (focus: FocusLabelView) =>
    view?.intensiveLabelIds.includes(focus.label.id) === true;

  async function changeIntensive(focus: FocusLabelView, intensive: boolean) {
    await onIntensiveChange(focus.label, intensive);
    await load(language);
  }

  async function undoUnpin(label: Label) {
    await onUndoUnpin(label);
    await load(language);
  }

  const langAttribute = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');
</script>

<div class="home">
  <header class="home-header">
    <div>
      <h2 id="home-title">{fr.home.title}</h2>
      {#if view?.state === 'default'}
        <p class="help">{format(fr.home.sessionLength, { minutes: view.session.minutes })}</p>
      {/if}
    </div>
    <div class="tabs" role="tablist" aria-label={fr.home.languageTabs}>
      {#each LANGUAGES as code (code)}
        <button
          bind:this={tabs[code]}
          type="button"
          role="tab"
          id={`home-tab-${code}`}
          aria-selected={language === code}
          aria-controls="home-panel"
          tabindex={language === code ? 0 : -1}
          onclick={() => {
            choose(code);
          }}
          onkeydown={onTabKey}
        >
          {#if code === 'zh'}<span lang="zh-CN">中文</span>{/if}
          {fr.languages[code]}
        </button>
      {/each}
    </div>
  </header>

  <div
    class="panel"
    role="tabpanel"
    id="home-panel"
    aria-labelledby={`home-tab-${language}`}
    tabindex="-1"
  >
    {#if failed}
      <p role="alert" class="error">{fr.home.loadFailed}</p>
    {:else if view === undefined}
      <p role="status">{fr.home.loading}</p>
    {:else}
      {#if view.unpinnedToday.length > 0}
        <section class="banner" aria-labelledby="home-unpinned-title">
          <h3 id="home-unpinned-title" class="visually-hidden">{fr.home.unpinnedTitle}</h3>
          {#each view.unpinnedToday as label (label.id)}
            <div class="banner-row">
              <p>
                {format(fr.home.unpinned, {
                  name: label.name,
                  date:
                    label.pastExamDate === undefined
                      ? ''
                      : shortDate.format(dayOf(label.pastExamDate)),
                })}
              </p>
              <button
                type="button"
                aria-label={format(fr.home.undoUnpinLabel, { name: label.name })}
                onclick={() => undoUnpin(label)}>{fr.home.undoUnpin}</button
              >
            </div>
          {/each}
        </section>
      {/if}

      <div class="layout">
        <div class="main-column">
          {#if view.state === 'noCards'}
            <section class="card empty" aria-labelledby="home-no-cards">
              <h3 id="home-no-cards">{fr.home.noCards}</h3>
              <p class="help">{fr.home.noCardsHelp}</p>
              <div class="actions">
                <button type="button" class="primary" onclick={onAddWords}
                  >{fr.home.addWords}</button
                >
                <button type="button" disabled>{fr.home.startNothing}</button>
              </div>
            </section>
          {:else}
            {#each view.focus as focus (focus.label.id)}
              {@const percent = percentOf(focus.mastery.mastered, focus.mastery.total)}
              <section class="card focus" aria-labelledby={`home-focus-${focus.label.id}`}>
                <div class="focus-head">
                  <div class="focus-title">
                    <span class="eyebrow">{fr.home.focusEyebrow}</span>
                    <h3 id={`home-focus-${focus.label.id}`}>{focus.label.name}</h3>
                    <span class="help">{formatCount(fr.home.wordCount, focus.wordCount)}</span>
                  </div>
                  {#if focus.forecast !== undefined && focus.label.examDate !== undefined}
                    <p class="countdown">
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        aria-hidden="true"
                        focusable="false"
                        ><rect x="3" y="4" width="18" height="18" rx="2"></rect><path
                          d="M16 2v4M8 2v4M3 10h18"
                        ></path></svg
                      >
                      {countdown(focus.forecast, focus.label.examDate)}
                    </p>
                  {/if}
                </div>

                <div class="focus-body">
                  <div
                    class="gauge"
                    role="img"
                    aria-label={formatCount(fr.home.gauge, focus.mastery.mastered, {
                      total: focus.mastery.total,
                      percent,
                    })}
                  >
                    <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
                      <circle class="gauge-track" cx="18" cy="18" r="15.9155" pathLength="100"
                      ></circle>
                      {#if percent > 0}
                        <circle
                          class="gauge-value"
                          cx="18"
                          cy="18"
                          r="15.9155"
                          pathLength="100"
                          stroke-dasharray={`${String(percent)} 100`}
                        ></circle>
                      {/if}
                    </svg>
                    <span class="gauge-text" aria-hidden="true">
                      <strong>{percent} %</strong>
                      <span>{fr.home.gaugeCaption}</span>
                    </span>
                  </div>
                  <div class="focus-plan">
                    <p aria-live="polite">
                      <strong
                        >{format(fr.home.mastered, {
                          mastered: focus.mastery.mastered,
                          total: focus.mastery.total,
                        })}</strong
                      >
                      {#if focus.forecast !== undefined}
                        {statusText(focus.forecast)}
                      {/if}
                    </p>
                    <ul class="pills">
                      {#if focus.dueCount > 0}
                        <li class="pill thirst">
                          {formatCount(fr.home.thirstPill, focus.dueCount)}
                        </li>
                      {/if}
                      {#if focus.newCount > 0}
                        <li class="pill new">{formatCount(fr.home.newPill, focus.newCount)}</li>
                      {/if}
                    </ul>
                  </div>
                </div>

                {#if onOpenPath !== undefined}
                  <div class="actions">
                    <button
                      type="button"
                      aria-label={format(fr.home.openPathLabel, { name: focus.label.name })}
                      onclick={() => {
                        onOpenPath(focus.label, language);
                      }}>{fr.home.openPath}</button
                    >
                  </div>
                {/if}

                {#if focus.forecast?.status === 'examDay'}
                  <div class="actions">
                    <button
                      type="button"
                      onclick={() => {
                        onPractice(language, [focus.label.id]);
                      }}>{fr.home.warmUp}</button
                    >
                  </div>
                {/if}

                {#if focus.forecast?.status === 'overloaded'}
                  <div class="choices" role="group" aria-label={fr.home.overload.legend}>
                    <span class="choices-legend" aria-hidden="true">{fr.home.overload.legend}</span>
                    <button
                      type="button"
                      aria-pressed={!isIntensive(focus)}
                      onclick={() => changeIntensive(focus, false)}
                      >{fr.home.overload.normal}</button
                    >
                    <button
                      type="button"
                      aria-pressed={isIntensive(focus)}
                      aria-describedby={`home-intensive-${focus.label.id}`}
                      onclick={() => changeIntensive(focus, true)}
                      >{fr.home.overload.intensive}</button
                    >
                    <button
                      type="button"
                      aria-describedby={`home-skim-${focus.label.id}`}
                      onclick={() => {
                        onPractice(language, [focus.label.id]);
                      }}>{fr.home.overload.skim}</button
                    >
                    <p class="help" id={`home-intensive-${focus.label.id}`}>
                      {fr.home.overload.intensiveHelp}
                    </p>
                    <p class="help" id={`home-skim-${focus.label.id}`}>
                      {fr.home.overload.skimHelp}
                    </p>
                  </div>
                {/if}
              </section>
            {:else}
              <p class="card help">{fr.home.noFocus}</p>
            {/each}

            {#if view.state === 'nothingDue'}
              <section class="card" aria-labelledby="home-nothing-due">
                <h3 id="home-nothing-due">{fr.home.nothingDue}</h3>
                <button
                  type="button"
                  onclick={() => {
                    onPractice(language, []);
                  }}>{fr.home.freePractice}</button
                >
              </section>
            {:else}
              <button
                type="button"
                class="primary start"
                onclick={() => {
                  onStart(language);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="currentColor"
                  aria-hidden="true"
                  focusable="false"><path d="M7 4v16l13-8z"></path></svg
                >
                {format(fr.home.start, { minutes: view.session.minutes })}
              </button>
            {/if}
          {/if}
        </div>

        <aside class="side-column">
          <section class="card" aria-labelledby="home-progress-title">
            <h3 id="home-progress-title">{fr.home.progressTitle}</h3>
            {#if view.progress === undefined}
              <p class="help">{fr.home.progressNeutral}</p>
            {:else}
              <div class="goal">
                <span class="stat-label">{fr.home.dailyGoal}</span>
                <span
                  >{format(fr.home.dailyGoalValue, {
                    xp: view.progress.dailyXp,
                    goal: view.progress.dailyGoalXp,
                  })}</span
                >
                <meter
                  min="0"
                  max={view.progress.dailyGoalXp}
                  value={view.progress.dailyXp}
                  aria-label={fr.home.dailyGoal}
                ></meter>
              </div>
              <div class="stats">
                {#if view.progress.streakDays !== undefined}
                  <div class="stat">
                    <span class="stat-label">{fr.home.streak}</span>
                    <strong class="stat-value"
                      >{formatCount(fr.home.streakValue, view.progress.streakDays)}</strong
                    >
                    {#if view.progress.bestStreak !== undefined}
                      <span class="help"
                        >{format(fr.home.bestStreak, { count: view.progress.bestStreak })}</span
                      >
                    {/if}
                  </div>
                {/if}
                {#if view.progress.level !== undefined}
                  <div class="stat">
                    <span class="stat-label">{fr.home.level}</span>
                    <strong class="stat-value"
                      >{format(fr.home.levelValue, { level: view.progress.level })}</strong
                    >
                    {#if view.progress.xp !== undefined}
                      <span class="help">{format(fr.home.xpTotal, { xp: view.progress.xp })}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </section>

          <section class="card" aria-labelledby="home-resisting-title">
            <h3 id="home-resisting-title">{fr.home.resistingTitle}</h3>
            {#if view.resisting.length === 0}
              <p class="help">{fr.home.resistingEmpty}</p>
            {:else}
              <ul class="resisting">
                {#each view.resisting as { card } (card.id)}
                  <li>
                    <span class="term" lang={langAttribute(card.language)}>{card.term}</span>
                    <span class="help meaning">{card.translation}</span>
                    <button
                      type="button"
                      class="listen"
                      aria-label={format(fr.home.listenWord, { term: card.term })}
                      onclick={() =>
                        void speaker.speak(card.term, card.language).catch(() => undefined)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        aria-hidden="true"
                        focusable="false"
                        ><path d="M11 5 6 9H2v6h4l5 4z"></path><path
                          d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"
                        ></path></svg
                      >
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </aside>
      </div>

      {#if view.others.length > 0}
        <section class="labels" aria-labelledby="home-labels-title">
          <div class="labels-head">
            <h3 id="home-labels-title">{fr.home.labelsTitle}</h3>
            <button type="button" class="link" onclick={onAddWords}>{fr.home.addWords}</button>
          </div>
          <ul class="label-grid">
            {#each view.others as other (other.label.id)}
              <li class="card label-card">
                <div class="label-top">
                  <strong>{other.label.name}</strong>
                  <span class={other.dueCount > 0 ? 'badge thirst' : 'badge'}>
                    {other.dueCount > 0
                      ? format(fr.home.labelThirst, { count: other.dueCount })
                      : fr.home.labelUpToDate}
                  </span>
                </div>
                <meter
                  min="0"
                  max={other.mastery.total}
                  value={other.mastery.mastered}
                  aria-label={format(fr.home.labelMastery, {
                    name: other.label.name,
                    mastered: other.mastery.mastered,
                    total: other.mastery.total,
                  })}
                ></meter>
                <span class="help">{formatCount(fr.home.wordCount, other.wordCount)}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* The home is made of its own cards: a plain block, not one of the page's cards. */
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .home-header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
  }

  .home-header h2 {
    margin: 0;
    font-size: var(--text-2xl);
  }

  .home-header p {
    margin: 0;
  }

  .tabs {
    display: flex;
    padding: var(--space-1);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
  }

  .tabs button {
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--ink);
    font-weight: var(--weight-bold);
  }

  .tabs button[aria-selected='true'] {
    background: var(--ink);
    color: var(--on-ink);
    font-weight: var(--weight-heavy);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .layout,
  .main-column,
  .side-column {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .card {
    margin: 0;
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
  }

  .card h3 {
    margin: 0 0 var(--space-2);
  }

  .focus {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .focus-head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: flex-start;
    justify-content: space-between;
  }

  .focus-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .focus-title h3 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .eyebrow {
    color: var(--jade-strong);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .countdown {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--seal-soft);
    color: var(--seal);
    font-size: var(--text-sm);
    font-weight: var(--weight-heavy);
  }

  .focus-body {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    align-items: center;
  }

  .gauge {
    position: relative;
    flex-shrink: 0;
    width: 120px;
    height: 120px;
  }

  .gauge svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .gauge circle {
    fill: none;
    stroke-width: 3.5;
  }

  .gauge-track {
    stroke: var(--track);
  }

  .gauge-value {
    stroke: var(--jade);
    stroke-linecap: round;
  }

  .gauge-text {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xs);
    color: var(--muted);
  }

  .gauge-text strong {
    color: var(--ink);
    font-size: var(--text-xl);
    font-weight: var(--weight-heavy);
  }

  .focus-plan {
    display: flex;
    flex: 1 1 14rem;
    flex-direction: column;
    gap: var(--space-3);
  }

  .focus-plan p {
    margin: 0;
  }

  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pill,
  .badge {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--ink-soft);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    white-space: nowrap;
  }

  .pill.thirst,
  .badge.thirst {
    background: var(--thirst-soft);
    color: var(--thirst);
  }

  .pill.new {
    background: var(--info-soft);
    color: var(--info);
  }

  .actions,
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .choices p {
    flex: 1 1 100%;
    margin: 0;
  }

  .choices-legend {
    flex: 1 1 100%;
    font-weight: var(--weight-heavy);
  }

  .choices button[aria-pressed='true'] {
    border-color: var(--jade);
    background: var(--jade-soft);
    color: var(--jade-strong);
    font-weight: var(--weight-heavy);
  }

  .start {
    align-self: stretch;
    min-height: var(--target-lg);
    font-size: var(--text-lg);
    font-weight: var(--weight-heavy);
  }

  .goal {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-2);
    align-items: baseline;
  }

  .goal meter {
    grid-column: 1 / -1;
    width: 100%;
    height: 12px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .stat-label {
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
  }

  .stat-value {
    font-size: var(--text-xl);
    font-weight: var(--weight-heavy);
  }

  .resisting {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .resisting li {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }

  .term {
    font-size: var(--text-lg);
  }

  .meaning {
    flex: 1;
  }

  .listen {
    padding: 0;
    color: var(--jade);
  }

  .banner {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--seal-soft);
    border: 1px solid var(--line);
    border-left: 4px solid var(--seal);
    border-radius: var(--radius-md);
  }

  .banner-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }

  .banner-row p {
    margin: 0;
    font-weight: var(--weight-bold);
  }

  .labels-head {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
  }

  .labels-head h3 {
    margin: 0;
  }

  .link {
    border: 0;
    background: transparent;
    color: var(--jade);
    font-weight: var(--weight-heavy);
  }

  .label-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--space-3);
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .label-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .label-top {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
  }

  .label-card meter {
    width: 100%;
    height: 8px;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Computer: the main column and the side column, as in docs/ui/mockups/Main.dc.html. */
  @media (min-width: 1100px) {
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
      gap: var(--space-5);
      align-items: start;
    }

    .card {
      padding: var(--space-5) var(--space-6);
    }

    .start {
      align-self: flex-start;
    }
  }
</style>
