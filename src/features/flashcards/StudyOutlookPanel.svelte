<script lang="ts">
  import { addDays, type LocalDay } from '../../domain/srs/localDay';
  import { formatCount } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { StudyOutlookView } from './flashcardSession';

  interface Props {
    outlook: StudyOutlookView;
  }

  const { outlook }: Props = $props();

  // Local days are calendar dates: formatted in UTC so that no time zone shifts them.
  const dateFormat = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  function dayName(day: LocalDay): string {
    return day === addDays(outlook.today, 1)
      ? fr.outlook.tomorrow
      : dateFormat.format(new Date(`${day}T00:00:00Z`));
  }
</script>

<div class="outlook" aria-live="polite">
  <p>
    {formatCount(fr.outlook.today, outlook.newAvailableToday, { due: outlook.dueToday })}
  </p>
  {#if outlook.newWaiting > 0}
    <p>{formatCount(fr.outlook.waiting, outlook.newWaiting, { perDay: outlook.newPerDay })}</p>
  {/if}
  {#if outlook.reviewedToday > 0}
    <p>{formatCount(fr.outlook.reviewedToday, outlook.reviewedToday)}</p>
  {/if}
  {#if outlook.nextReview !== undefined}
    <p>
      {formatCount(fr.outlook.nextReview, outlook.nextReview.count, {
        day: dayName(outlook.nextReview.day),
      })}
    </p>
  {/if}
</div>

<style>
  .outlook {
    margin: 0 0 var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-left: 4px solid var(--jade);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }

  .outlook p {
    margin: var(--space-1) 0;
  }
</style>
