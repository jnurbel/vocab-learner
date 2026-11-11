<script lang="ts">
  import { tick } from 'svelte';
  import {
    createProfile,
    PROFILE_NAME_MAX_LENGTH,
    renameProfile,
    type Profile,
    type ProfileError,
  } from '../../domain/profile';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';

  interface Props {
    profiles: readonly Profile[];
    current: Profile;
    newId: () => string;
    clock: () => string;
    onSwitch: (profile: Profile) => Promise<void>;
    onCreate: (profile: Profile) => Promise<void>;
    onRename: (profile: Profile) => Promise<void>;
    onDelete: (profile: Profile) => Promise<void>;
    /** Downloads the backup of a profile, offered before deleting it. */
    onBackup: (profile: Profile) => Promise<void>;
  }

  const {
    profiles,
    current,
    newId,
    clock,
    onSwitch,
    onCreate,
    onRename,
    onDelete,
    onBackup,
  }: Props = $props();
  const texts = fr.profiles;

  let open = $state(false);
  let toggle = $state<HTMLButtonElement>();
  let newName = $state('');
  /** The outcome of the last action: a confirmation, or why it was refused. */
  let message = $state<{ kind: 'status' | 'alert'; text: string }>();

  function refuse(errors: readonly ProfileError[]) {
    message = { kind: 'alert', text: texts.errors[errors[0] ?? 'required'] };
  }

  /** Runs a change; a storage failure changes nothing and is said so. */
  async function attempt(change: () => Promise<void>, success: string) {
    try {
      await change();
      message = { kind: 'status', text: success };
    } catch {
      message = { kind: 'alert', text: texts.failed };
    }
  }

  /** The profile being renamed, with the pseudonym typed so far. */
  let renaming = $state<{ id: string; name: string }>();

  async function rename(event: SubmitEvent, profile: Profile) {
    event.preventDefault();
    const renamed = renameProfile(profiles, profile.id, renaming?.name ?? '');
    const changed = renamed.ok ? renamed.value.find(({ id }) => id === profile.id) : undefined;
    if (!renamed.ok || changed === undefined) {
      refuse(renamed.ok ? ['profileNotFound'] : renamed.errors);
      return;
    }
    await attempt(
      async () => {
        await onRename(changed);
        renaming = undefined;
      },
      format(texts.renamed, { name: changed.displayName }),
    );
  }

  /** Deleting asks twice; the backup of the profile is offered at the first step. */
  let deleting = $state<{ profile: Profile; step: 'first' | 'final' }>();
  let cancelDeletion = $state<HTMLButtonElement>();

  async function askDeletion(profile: Profile, step: 'first' | 'final') {
    deleting = { profile, step };
    await tick();
    cancelDeletion?.focus();
  }

  async function backUp(profile: Profile) {
    await attempt(() => onBackup(profile), format(texts.backupDone, { name: profile.displayName }));
  }

  async function remove(profile: Profile) {
    deleting = undefined;
    await attempt(() => onDelete(profile), format(texts.deleted, { name: profile.displayName }));
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    const created = createProfile(profiles, newName, { id: newId(), now: clock() });
    if (!created.ok) {
      refuse(created.errors);
      return;
    }
    await attempt(
      async () => {
        await onCreate(created.value);
        newName = '';
      },
      format(texts.created, { name: created.value.displayName }),
    );
  }

  async function close() {
    open = false;
    await tick();
    toggle?.focus();
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (open && event.key === 'Escape') {
      void close();
    }
  }
</script>

<svelte:window onkeydown={closeOnEscape} />

<div class="profile-menu">
  <button
    type="button"
    class="toggle"
    aria-expanded={open}
    aria-controls="profile-panel"
    bind:this={toggle}
    onclick={() => {
      open = !open;
    }}>{format(texts.toggle, { name: current.displayName })}</button
  >

  {#if open}
    <section id="profile-panel" class="panel" aria-labelledby="profile-panel-title">
      <h2 id="profile-panel-title">{texts.title}</h2>
      <p class="help">{texts.help}</p>
      <ul aria-label={texts.listLabel}>
        {#each profiles as profile (profile.id)}
          <li>
            <span class="name">{profile.displayName}</span>
            {#if profile.id === current.id}
              <span class="current">{texts.current}</span>
            {:else}
              <button
                type="button"
                aria-label={format(texts.openLabel, { name: profile.displayName })}
                onclick={() => onSwitch(profile)}>{texts.open}</button
              >
            {/if}
            <button
              type="button"
              aria-label={format(texts.renameLabel, { name: profile.displayName })}
              onclick={() => {
                renaming = { id: profile.id, name: profile.displayName };
              }}>{texts.rename}</button
            >
            {#if profiles.length > 1}
              <button
                type="button"
                aria-label={format(texts.deleteLabel, { name: profile.displayName })}
                onclick={() => askDeletion(profile, 'first')}>{texts.delete}</button
              >
            {/if}

            {#if renaming?.id === profile.id}
              <form class="rename" onsubmit={(event) => rename(event, profile)}>
                <input
                  type="text"
                  maxlength={PROFILE_NAME_MAX_LENGTH}
                  autocomplete="off"
                  aria-label={format(texts.renameInput, { name: profile.displayName })}
                  bind:value={renaming.name}
                />
                <button type="submit">{texts.renameSave}</button>
                <button
                  type="button"
                  onclick={() => {
                    renaming = undefined;
                  }}>{texts.cancel}</button
                >
              </form>
            {/if}

            {#if deleting?.profile.id === profile.id}
              {@const question = format(
                deleting.step === 'first' ? texts.confirmDelete : texts.confirmDeleteFinal,
                { name: profile.displayName },
              )}
              <div class="confirmation" role="group" aria-label={question}>
                <p>{question}</p>
                {#if deleting.step === 'first'}
                  <button type="button" class="primary" onclick={() => backUp(profile)}
                    >{texts.backupFirst}</button
                  >
                  <button type="button" onclick={() => askDeletion(profile, 'final')}
                    >{texts.continueDelete}</button
                  >
                {:else}
                  <button type="button" class="danger" onclick={() => remove(profile)}
                    >{format(texts.deleteForever, { name: profile.displayName })}</button
                  >
                {/if}
                <button
                  type="button"
                  bind:this={cancelDeletion}
                  onclick={() => {
                    deleting = undefined;
                  }}>{texts.cancel}</button
                >
              </div>
            {/if}
          </li>
        {/each}
      </ul>

      <form class="create" onsubmit={create}>
        <h3>{texts.createTitle}</h3>
        <label for="profile-create-name">{texts.createInput}</label>
        <input
          id="profile-create-name"
          type="text"
          maxlength={PROFILE_NAME_MAX_LENGTH}
          autocomplete="off"
          aria-describedby="profile-create-help"
          bind:value={newName}
        />
        <p id="profile-create-help" class="help">{texts.createHelp}</p>
        <button type="submit" class="primary">{texts.create}</button>
      </form>

      {#if message?.kind === 'status'}
        <p role="status">{message.text}</p>
      {:else if message?.kind === 'alert'}
        <p role="alert" class="error">{message.text}</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .profile-menu {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .toggle {
    align-self: flex-start;
    min-height: var(--target);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
  }

  h2 {
    margin: 0;
    font-size: var(--text-md);
  }

  .help {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .create {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  h3 {
    margin: 0;
    font-size: var(--text-sm);
  }

  label {
    font-weight: var(--weight-bold);
  }

  .create button {
    align-self: flex-start;
  }

  .rename,
  .confirmation {
    display: flex;
    flex: 1 1 100%;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  /* A destructive action asks first, in the colour of mistakes, as ConfirmAction does. */
  .confirmation {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--ochre-soft);
  }

  .confirmation p {
    flex: 1 1 100%;
    margin: 0;
    color: var(--ink);
    font-weight: var(--weight-bold);
  }

  .danger {
    border-color: var(--ochre);
    color: var(--ochre);
    font-weight: var(--weight-heavy);
  }

  .name {
    font-weight: var(--weight-bold);
    overflow-wrap: anywhere;
  }

  .current {
    color: var(--jade-strong);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
  }
</style>
