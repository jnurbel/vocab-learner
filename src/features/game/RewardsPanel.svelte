<script lang="ts">
  import type { XpReason } from '../../domain/game/xp';
  import { format, formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { RewardsSummary } from './sessionRewards';

  interface Props {
    rewards: RewardsSummary;
    /** Words still thirsty today, offered as a bonus session (GAME_DESIGN.md 8.3). */
    thirstyLeft?: number;
    onContinue?: () => void;
  }

  const { rewards, thirstyLeft = 0, onContinue }: Props = $props();

  /** A thirsty word takes about this long to water, feedback included. */
  const SECONDS_PER_WORD = 20;

  const reasons = $derived(
    (Object.entries(rewards.breakdown) as [XpReason, number][]).filter(([, xp]) => xp > 0),
  );
  const goalPercent = $derived(Math.min(100, (rewards.dailyXp / rewards.goal) * 100));
  const unlockNames = (ids: readonly string[]) =>
    ids.map((id) => (fr.game.unlocks as Record<string, string>)[id] ?? id).join(', ');
</script>

<div class="rewards" aria-label={fr.game.rewardsTitle} role="group">
  <div class="tile xp">
    <p class="label">{fr.game.xpGainedLabel}</p>
    <p class="big">{format(fr.game.xpGained, { xp: rewards.xpGained })}</p>
    {#if reasons.length > 0}
      <details>
        <summary>{fr.game.xpDetail}</summary>
        <ul>
          {#each reasons as [reason, xp] (reason)}
            <li>{format(fr.game.xpLine, { reason: fr.game.reasons[reason], xp })}</li>
          {/each}
        </ul>
      </details>
    {/if}
  </div>

  <div class="tile goal" class:reached={rewards.goalReached}>
    <p>
      {#if rewards.goalReached}<span class="mark" aria-hidden="true">✓</span>{/if}
      {format(fr.game.dailyGoalProgress, { xp: rewards.dailyXp, goal: rewards.goal })}
    </p>
    <div
      class="bar"
      role="progressbar"
      aria-label={fr.game.dailyGoal}
      aria-valuemin="0"
      aria-valuemax={rewards.goal}
      aria-valuenow={rewards.dailyXp}
    >
      <span class="fill" style:width="{goalPercent}%"></span>
    </div>
    {#if rewards.goalReached}
      <p class="help">{fr.game.dailyGoalReached}</p>
    {/if}
  </div>

  <div class="tile">
    <p>
      {formatCount(fr.game.streak, rewards.streakDays, { best: rewards.bestStreak })}
    </p>
  </div>

  <div class="tile">
    <p class="strong">{format(fr.game.level, { level: rewards.level })}</p>
    <p class="help">
      {format(fr.game.xpToNext, { xp: rewards.xpToNext, next: rewards.level + 1 })}
    </p>
    {#each rewards.levelUps as level (level)}
      <p class="level-up">{format(fr.game.levelUp, { level })}</p>
    {/each}
    {#if rewards.unlocks.length > 0}
      <p>{format(fr.game.unlocked, { names: unlockNames(rewards.unlocks) })}</p>
    {/if}
  </div>
</div>

{#if thirstyLeft > 0 && onContinue !== undefined}
  <button type="button" class="bonus" onclick={onContinue}
    >{formatCount(fr.game.bonusOffer, thirstyLeft, {
      minutes: Math.max(1, Math.round((thirstyLeft * SECONDS_PER_WORD) / 60)),
    })}</button
  >
{/if}

<style>
  .rewards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-3);
    margin: var(--space-4) 0;
  }

  .tile {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }

  .tile p {
    margin: 0 0 var(--space-1);
  }

  .label {
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
  }

  .big {
    color: var(--jade-strong);
    font-size: var(--text-2xl);
    font-weight: var(--weight-heavy);
  }

  .strong,
  .level-up {
    font-weight: var(--weight-heavy);
  }

  .level-up {
    color: var(--jade-strong);
  }

  details summary {
    min-height: var(--target);
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--jade-strong);
    font-weight: var(--weight-bold);
  }

  details ul {
    margin: 0;
    padding-left: var(--space-4);
    font-size: var(--text-sm);
  }

  .mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    margin-right: var(--space-1);
    border-radius: 50%;
    background: var(--jade);
    color: var(--on-jade);
    font-size: var(--text-sm);
  }

  .bar {
    height: 10px;
    margin: var(--space-2) 0;
    overflow: hidden;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    background: var(--track);
  }

  .fill {
    display: block;
    height: 100%;
    background: var(--jade);
    transition: width var(--duration) ease-out;
  }

  .bonus {
    margin-bottom: var(--space-3);
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
