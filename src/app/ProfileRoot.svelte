<script lang="ts">
  import { onMount } from 'svelte';
  import { sha256With } from '../domain/backup/sha256';
  import { profileDatabaseName, startProfile, type Profile } from '../domain/profile';
  import ProfileSwitcher from '../features/profiles/ProfileSwitcher.svelte';
  import { BackupService, type BackupFile } from '../services/backup/backupService';
  import type { DirectoryHandleLike } from '../services/backup/directoryBackup';
  import { browserDownloadEnvironment, downloadFile } from '../services/backup/downloadFile';
  import type { SharedFile, ShareOutcome } from '../services/pack/shareFile';
  import type { Speaker, VoiceCatalog } from '../services/tts/speaker';
  import { BackupRepository } from '../storage/backupRepository';
  import { ProfileRegistry } from '../storage/profileRegistry';
  import App from './App.svelte';
  import { appVersion } from './appVersion';

  /** The browser's services by default; the same as App's, handed over to the app of a profile. */
  interface Props {
    /** The list of the profiles of this device. */
    registry?: ProfileRegistry;
    requestPersistence?: () => Promise<void>;
    speaker?: Speaker;
    voices?: VoiceCatalog;
    download?: (file: BackupFile) => void;
    directoryPicker?: (() => Promise<DirectoryHandleLike>) | undefined;
    now?: () => Date;
    share?: (file: SharedFile) => Promise<ShareOutcome>;
  }

  const {
    registry = new ProfileRegistry(),
    download = (file: BackupFile) => {
      downloadFile(file, browserDownloadEnvironment());
    },
    now = () => new Date(),
    ...appProps
  }: Props = $props();

  let profiles = $state.raw<Profile[]>([]);
  let current = $state.raw<Profile>();

  const clock = () => now().toISOString();
  const newId = () => crypto.randomUUID();

  onMount(async () => {
    profiles = await registry.profiles(clock());
    const opened = startProfile(profiles, await registry.lastUsedId());
    if (opened !== undefined) {
      await switchTo(opened);
    }
  });

  /** The app of the profile is built anew: nothing of the previous one stays in memory. */
  async function switchTo(profile: Profile) {
    await registry.markUsed(profile.id);
    current = profile;
  }

  async function create(profile: Profile) {
    await registry.add(profile);
    profiles = [...profiles, profile];
    await switchTo(profile);
  }

  async function rename(profile: Profile) {
    await registry.save(profile);
    profiles = profiles.map((kept) => (kept.id === profile.id ? profile : kept));
    if (current?.id === profile.id) {
      current = profile;
    }
  }

  /** The profile open is left first, so that its database is no longer in use. */
  async function remove(profile: Profile) {
    const remaining = profiles.filter(({ id }) => id !== profile.id);
    if (current?.id === profile.id && remaining[0] !== undefined) {
      await switchTo(remaining[0]);
    }
    await registry.remove(profile.id);
    profiles = remaining;
  }

  /** The backup of any profile, as the backup screen of that profile would make it. */
  async function backUp(profile: Profile) {
    const service = new BackupService({
      repository: new BackupRepository(profileDatabaseName(profile.id)),
      sha256: sha256With(crypto.subtle),
      clock: now,
      newId,
      appVersion,
      profileName: profile.displayName,
    });
    download(await service.createBackupFile());
  }
</script>

{#if current !== undefined}
  {@const shown = current}
  {#key shown.id}
    <App
      {...appProps}
      {download}
      {now}
      databaseName={profileDatabaseName(shown.id)}
      profileName={shown.displayName}
    >
      {#snippet profileMenu()}
        <ProfileSwitcher
          {profiles}
          current={shown}
          {newId}
          {clock}
          onSwitch={switchTo}
          onCreate={create}
          onRename={rename}
          onDelete={remove}
          onBackup={backUp}
        />
      {/snippet}
    </App>
  {/key}
{/if}
