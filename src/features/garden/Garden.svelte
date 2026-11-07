<script lang="ts">
  import type { Card, Language } from '../../domain/card';
  import { ECONOMY_CONFIG } from '../../domain/game/economyConfig';
  import { gardenCounts, gardenPage, gardenPlants, type Plant } from '../../domain/game/garden';
  import { levelFor } from '../../domain/game/level';
  import { achievementsOf, nextLevelUnlocks } from '../../domain/game/unlocks';
  import type { Label } from '../../domain/label';
  import type { ProgressRecord } from '../../domain/progressRecords';
  import type { Moment, SrsDependencies } from '../../domain/srs/dependencies';
  import type { LocalDay } from '../../domain/srs/localDay';
  import type { ReviewState } from '../../domain/srs/reviewState';
  import { STAGES } from '../../domain/srs/stage';
  import { format, formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import PlantDrawing from './Plant.svelte';

  interface Props {
    cards: readonly Card[];
    labels: readonly Label[];
    reviewStates: readonly ReviewState[];
    moment: Moment;
    srs: SrsDependencies;
    progress: ProgressRecord | undefined;
    /** Waters the thirsty words: opens the flashcards. */
    onWater: () => void;
    onMiniGame: () => void;
  }

  const { cards, labels, reviewStates, moment, srs, progress, onWater, onMiniGame }: Props =
    $props();

  const LANGUAGES: readonly Language[] = ['zh', 'en'];
  /** Enough to fill a screen; more words are paged, so that 500 words stay fluid. */
  const PAGE_SIZE = 48;

  let labelId = $state('');
  let listView = $state(false);
  let pages = $state<Record<Language, number>>({ zh: 0, en: 0 });

  const plants = $derived(gardenPlants(cards, reviewStates, moment, srs));
  const counts = $derived(gardenCounts(plants));
  const xp = $derived(progress?.xp ?? 0);
  const level = $derived(levelFor(xp, ECONOMY_CONFIG));
  const upcoming = $derived(nextLevelUnlocks(xp, ECONOMY_CONFIG, 3));
  const achievements = $derived(
    achievementsOf(
      { flowers: counts.flowers, lanterns: counts.lanterns, bestStreak: progress?.bestStreak ?? 0 },
      ECONOMY_CONFIG,
    ),
  );
  const listed = $derived(
    labelId === '' ? plants : plants.filter(({ card }) => card.labelIds.includes(labelId)),
  );

  const plotOf = (language: Language) =>
    gardenPage(plants, {
      language,
      ...(labelId === '' ? {} : { labelId }),
      page: pages[language],
      pageSize: PAGE_SIZE,
    });

  const lang = (code: Language) => (code === 'zh' ? 'zh-CN' : 'en');
  const unlockNames = (ids: readonly string[]) =>
    ids.map((id) => (fr.game.unlocks as Record<string, string>)[id] ?? id).join(', ');
  const stageText = (plant: Plant) =>
    plant.wilted
      ? format(fr.garden.wilted, { stage: fr.stages[plant.stage] })
      : fr.stages[plant.stage];

  // Local days are calendar dates: formatted in UTC so that no time zone shifts them.
  const dateFormat = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const reviewDate = (day: LocalDay | undefined) =>
    day === undefined ? fr.garden.noReview : dateFormat.format(new Date(`${day}T00:00:00Z`));

  function turnPage(language: Language, step: number) {
    pages = { ...pages, [language]: plotOf(language).page + step };
  }

  function chooseLabel() {
    pages = { zh: 0, en: 0 };
  }
</script>

<section aria-labelledby="garden-title" class="garden">
  <header class="head">
    <div>
      <p class="eyebrow">{format(fr.garden.levelLine, { level, xp })}</p>
      <h2 id="garden-title">{fr.garden.title}</h2>
      <p class="counts">
        <span>{formatCount(fr.garden.flowers, counts.flowers)}</span>
        <span class="thirst-count">{formatCount(fr.garden.thirsty, counts.thirsty)}</span>
      </p>
    </div>
    <div class="actions">
      <button type="button" class="primary" onclick={onWater}>{fr.garden.water}</button>
      <button type="button" onclick={onMiniGame}>{fr.garden.miniGame}</button>
    </div>
  </header>

  {#if cards.length === 0}
    <p class="empty">{fr.garden.empty}</p>
  {:else}
    <div class="tools">
      {#if labels.length > 0}
        <label class="filter">
          {fr.garden.labelFilter}
          <select bind:value={labelId} onchange={chooseLabel}>
            <option value="">{fr.garden.allLabels}</option>
            {#each labels as label (label.id)}
              <option value={label.id}>{label.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      <button
        type="button"
        aria-pressed={listView}
        onclick={() => {
          listView = !listView;
        }}>{fr.garden.listView}</button
      >
    </div>

    {#if listView}
      <div class="table-scroll">
        <table>
          <caption>{fr.garden.tableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{fr.garden.columns.word}</th>
              <th scope="col">{fr.garden.columns.language}</th>
              <th scope="col">{fr.garden.columns.stage}</th>
              <th scope="col">{fr.garden.columns.thirst}</th>
              <th scope="col">{fr.garden.columns.nextReview}</th>
            </tr>
          </thead>
          <tbody>
            {#each listed as plant (plant.card.id)}
              <tr>
                <th scope="row" lang={lang(plant.card.language)}>{plant.card.term}</th>
                <td>{fr.languages[plant.card.language]}</td>
                <td>{stageText(plant)}</td>
                <td>{fr.garden.thirstLevels[plant.thirst]}</td>
                <td>{reviewDate(plant.nextReview)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="plots">
        {#each LANGUAGES as language (language)}
          {@const plot = plotOf(language)}
          <div class="plot plot-{language}">
            <h3 id="plot-{language}">{fr.garden.plots[language]}</h3>
            {#if plot.total === 0}
              <p class="help">{fr.garden.emptyPlot}</p>
            {/if}
            <ul class="beds" aria-labelledby="plot-{language}">
              {#each plot.plants as plant (plant.card.id)}
                <li class="bed" class:thirsty={plant.thirst > 0}>
                  {#if plant.thirst > 0}
                    <span class="badge" aria-hidden="true">!</span>
                    <span class="visually-hidden">{fr.garden.thirstBadge}</span>
                  {/if}
                  <PlantDrawing stage={plant.stage} wilted={plant.wilted} />
                  <span class="word" lang={lang(plant.card.language)}>{plant.card.term}</span>
                  <span class="stage">{stageText(plant)}</span>
                </li>
              {/each}
            </ul>
            {#if plot.pageCount > 1}
              <div class="pager">
                <button
                  type="button"
                  disabled={plot.page === 0}
                  onclick={() => {
                    turnPage(language, -1);
                  }}>{fr.garden.previousPage}</button
                >
                <span>{format(fr.garden.page, { page: plot.page + 1, count: plot.pageCount })}</span
                >
                <button
                  type="button"
                  disabled={plot.page === plot.pageCount - 1}
                  onclick={() => {
                    turnPage(language, 1);
                  }}>{fr.garden.nextPage}</button
                >
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <div class="side">
    <div class="panel">
      <h3 id="garden-legend">{fr.garden.legendTitle}</h3>
      <ul class="legend" aria-labelledby="garden-legend">
        {#each STAGES as stage (stage)}
          <li>
            <PlantDrawing {stage} wilted={false} />
            <span
              >{format(fr.garden.legendLine, {
                stage: fr.stages[stage],
                rule: fr.garden.stageRules[stage],
              })}</span
            >
          </li>
        {/each}
      </ul>
      <p class="help">{fr.garden.legendNote}</p>
    </div>

    <div class="panel">
      <h3>{fr.garden.unlocksTitle}</h3>
      <ul class="unlocks">
        {#each upcoming as unlock (unlock.level)}
          <li>
            {format(fr.garden.unlockLine, {
              level: unlock.level,
              names: unlockNames(unlock.ids),
              xp: unlock.xpToGo,
            })}
          </li>
        {:else}
          <li>{fr.garden.noMoreUnlocks}</li>
        {/each}
        <li>
          {format(fr.garden.firefly, {
            have: ECONOMY_CONFIG.firefliesPerFlowers - achievements.flowersToNextFirefly,
          })}
        </li>
      </ul>
    </div>
  </div>
</section>

<style>
  .garden {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: flex-end;
    justify-content: space-between;
  }

  .head h2 {
    margin: 0;
  }

  .eyebrow {
    margin: 0;
    color: var(--jade);
    font-size: var(--text-sm);
    font-weight: var(--weight-heavy);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin: var(--space-1) 0 0;
    color: var(--ink-soft);
    font-weight: var(--weight-bold);
  }

  .thirst-count {
    color: var(--thirst);
  }

  .actions,
  .tools,
  .pager {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .filter {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    font-weight: var(--weight-bold);
  }

  .filter select {
    min-height: var(--target);
  }

  [aria-pressed='true'] {
    border-color: var(--jade);
    background: var(--jade-soft);
    color: var(--jade-strong);
  }

  .plots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: var(--space-3);
  }

  .plot {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    background: var(--jade-soft);
  }

  .plot-en {
    background: var(--info-soft);
  }

  .plot h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
  }

  .beds {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bed {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-2) var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface);
    text-align: center;
  }

  .bed.thirsty {
    outline: 2px dashed var(--thirst);
    outline-offset: -2px;
  }

  .badge {
    position: absolute;
    top: 4px;
    right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: var(--thirst);
    color: var(--surface);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
  }

  .word {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-weight: var(--weight-bold);
  }

  .stage {
    color: var(--muted);
    font-size: var(--text-xs);
  }

  .pager {
    margin-top: var(--space-2);
  }

  .side {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--space-3);
  }

  .panel {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }

  .panel h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
  }

  .legend,
  .unlocks {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .legend li {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .unlocks li {
    padding: var(--space-1) 0;
  }

  .table-scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  caption {
    text-align: left;
    font-weight: var(--weight-heavy);
  }

  th,
  td {
    padding: var(--space-2);
    border-bottom: 1px solid var(--line);
    text-align: left;
  }

  .empty {
    font-weight: var(--weight-bold);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
