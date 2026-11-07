<script lang="ts">
  import { NEW_PER_DAY_CHOICES } from '../../domain/studySettings';
  import fr from '../../i18n/fr.json';

  interface Props {
    /** The current daily quota of new words. */
    newPerDay: number;
    /** Saves a quota chosen among NEW_PER_DAY_CHOICES. */
    onNewPerDayChange: (newPerDay: number) => Promise<void>;
  }

  const { newPerDay, onNewPerDayChange }: Props = $props();

  // svelte-ignore state_referenced_locally
  let selected = $state(String(newPerDay));
  let status = $state<'saved' | 'saveFailed' | undefined>();

  /** A stored quota outside the choices (e.g. from a backup) stays selectable. */
  const choices = $derived(
    NEW_PER_DAY_CHOICES.includes(newPerDay)
      ? NEW_PER_DAY_CHOICES
      : [...NEW_PER_DAY_CHOICES, newPerDay].sort((a, b) => a - b),
  );

  async function save() {
    status = undefined;
    try {
      await onNewPerDayChange(Number(selected));
      status = 'saved';
    } catch {
      status = 'saveFailed';
    }
  }
</script>

<section aria-labelledby="settings-title">
  <h2 id="settings-title">{fr.settings.title}</h2>

  <label for="settings-new-per-day">{fr.settings.newPerDay}</label>
  <select
    id="settings-new-per-day"
    aria-describedby="settings-new-per-day-help"
    bind:value={selected}
    onchange={save}
  >
    {#each choices as choice (choice)}
      <option value={String(choice)}>{choice}</option>
    {/each}
  </select>
  <p id="settings-new-per-day-help" class="help">{fr.settings.newPerDayHelp}</p>

  <p aria-live="polite">
    {#if status === 'saved'}{fr.settings.saved}{/if}
  </p>
  {#if status === 'saveFailed'}
    <p role="alert" class="error">{fr.settings.saveFailed}</p>
  {/if}
</section>

<style>
  label {
    display: block;
    font-weight: bold;
  }

  select {
    min-height: 44px;
    min-width: 6rem;
  }

  .help {
    font-size: 0.9rem;
  }

  .error {
    color: #b00020;
  }
</style>
