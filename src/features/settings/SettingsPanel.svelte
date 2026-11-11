<script lang="ts">
  import { NEW_PER_DAY_CHOICES } from '../../domain/studySettings';
  import fr from '../../i18n/fr.json';

  interface Props {
    /** The current daily quota of new words. */
    newPerDay: number;
    /** Saves a quota chosen among NEW_PER_DAY_CHOICES. */
    onNewPerDayChange: (newPerDay: number) => Promise<void>;
    /** Expert setting of the photo import: the zones are shown before the words. */
    photoZonesAlways?: boolean;
    onPhotoZonesAlwaysChange?: (always: boolean) => Promise<void>;
  }

  const { newPerDay, onNewPerDayChange, photoZonesAlways, onPhotoZonesAlwaysChange }: Props =
    $props();

  // svelte-ignore state_referenced_locally
  let selected = $state(String(newPerDay));
  let status = $state<'saved' | 'saveFailed' | undefined>();

  /** A stored quota outside the choices (e.g. from a backup) stays selectable. */
  const choices = $derived(
    NEW_PER_DAY_CHOICES.includes(newPerDay)
      ? NEW_PER_DAY_CHOICES
      : [...NEW_PER_DAY_CHOICES, newPerDay].sort((a, b) => a - b),
  );

  async function saveWith(change: () => Promise<void>) {
    status = undefined;
    try {
      await change();
      status = 'saved';
    } catch {
      status = 'saveFailed';
    }
  }

  function save() {
    void saveWith(() => onNewPerDayChange(Number(selected)));
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

  {#if photoZonesAlways !== undefined && onPhotoZonesAlwaysChange !== undefined}
    <label class="choice expert">
      <input
        type="checkbox"
        checked={photoZonesAlways}
        aria-describedby="settings-photo-zones-help"
        onchange={(event) => {
          const always = event.currentTarget.checked;
          void saveWith(() => onPhotoZonesAlwaysChange(always));
        }}
      />
      {fr.settings.photoZonesAlways}
    </label>
    <p id="settings-photo-zones-help" class="help">{fr.settings.photoZonesAlwaysHelp}</p>
  {/if}

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
    font-weight: var(--weight-heavy);
  }

  .expert {
    display: inline-flex;
    margin-top: var(--space-4);
    font-weight: var(--weight-bold);
  }

  select {
    min-width: 6rem;
  }

  .help {
    margin-top: var(--space-2);
    color: var(--muted);
    font-size: var(--text-sm);
  }
</style>
