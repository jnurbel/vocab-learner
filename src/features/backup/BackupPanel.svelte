<script lang="ts">
  import { onMount } from 'svelte';
  import type { BackupDocument } from '../../domain/backup/backupDocument';
  import type { BackupSummary } from '../../domain/backup/summarizeBackup';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import type { BackupFile, BackupService, RestoreMode } from '../../services/backup/backupService';
  import type { AutoBackupStatus, DirectoryBackup } from '../../services/backup/directoryBackup';
  import ConfirmAction from '../../ui/ConfirmAction.svelte';
  import { backupIssueMessages } from './backupIssueMessages';

  export type FolderControls = Pick<
    DirectoryBackup,
    'chooseFolder' | 'folderName' | 'forgetFolder' | 'reauthorize'
  >;

  interface Props {
    service: Pick<BackupService, 'createBackupFile' | 'readBackupFile' | 'restore'>;
    download: (file: BackupFile) => void;
    /** ISO datetime of the last backup, if any. */
    lastBackupAt: string | undefined;
    onBackedUp: () => Promise<void>;
    /** Called after a successful restore, to reload the data. */
    onRestored: () => Promise<void>;
    /** Only when the browser can write into a folder (Chrome, Edge). */
    folder?: FolderControls | undefined;
    autoBackupStatus?: AutoBackupStatus | undefined;
    /** Called once the folder access is granted again, to write the pending backup. */
    onReauthorized?: () => Promise<void>;
  }

  const {
    service,
    download,
    lastBackupAt,
    onBackedUp,
    onRestored,
    folder,
    autoBackupStatus,
    onReauthorized,
  }: Props = $props();

  type Message =
    | { kind: 'status'; text: string; safetyBackup?: BackupFile }
    | { kind: 'alert'; text: string; details?: string[] };
  let message = $state.raw<Message>();
  let busy = $state(false);
  let preview = $state.raw<{ backup: BackupDocument; summary: BackupSummary }>();
  let folderName = $state<string>();
  let fileInput = $state<HTMLInputElement>();

  const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' });

  onMount(() => {
    void refreshFolder();
  });

  async function refreshFolder() {
    folderName = await folder?.folderName();
  }

  async function saveNow() {
    busy = true;
    try {
      const file = await service.createBackupFile();
      download(file);
      await onBackedUp();
      message = { kind: 'status', text: format(fr.backup.saved, { fileName: file.fileName }) };
    } catch {
      message = { kind: 'alert', text: fr.backup.saveFailed };
    } finally {
      busy = false;
    }
  }

  async function readChosen(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    preview = undefined;
    if (file === undefined) {
      return;
    }
    busy = true;
    message = undefined;
    const read = await service.readBackupFile(file);
    busy = false;
    if (fileInput !== undefined) {
      // Choosing the same file again must trigger a new check.
      fileInput.value = '';
    }
    if (read.ok) {
      preview = read.value;
    } else {
      message = {
        kind: 'alert',
        text: fr.backup.refused,
        details: backupIssueMessages(read.errors),
      };
    }
  }

  async function restore(mode: RestoreMode) {
    if (preview === undefined) {
      return;
    }
    busy = true;
    try {
      const outcome = await service.restore(preview.backup, mode);
      preview = undefined;
      await onRestored();
      message =
        mode === 'merge'
          ? { kind: 'status', text: fr.backup.merged }
          : {
              kind: 'status',
              text: fr.backup.replaced,
              ...(outcome.safetyBackup === undefined ? {} : { safetyBackup: outcome.safetyBackup }),
            };
    } catch {
      message = { kind: 'alert', text: fr.backup.restoreFailed };
    } finally {
      busy = false;
    }
  }

  async function chooseFolder() {
    if (folder === undefined) {
      return;
    }
    const outcome = await folder.chooseFolder();
    if (outcome === 'failed' || outcome === 'unsupported') {
      message = { kind: 'alert', text: fr.backup.folderFailed };
    }
    await refreshFolder();
  }

  async function forgetFolder() {
    await folder?.forgetFolder();
    await refreshFolder();
  }

  async function reauthorize() {
    if (folder === undefined) {
      return;
    }
    if (await folder.reauthorize()) {
      await onReauthorized?.();
    } else {
      message = { kind: 'alert', text: fr.backup.reauthorizeFailed };
    }
  }
</script>

<section aria-labelledby="backup-title">
  <h2 id="backup-title">{fr.backup.title}</h2>
  <p>{fr.backup.intro}</p>

  {#if message?.kind === 'status'}
    <div role="status">
      <p>{message.text}</p>
      {#if message.safetyBackup !== undefined}
        {@const safetyBackup = message.safetyBackup}
        <button
          type="button"
          onclick={() => {
            download(safetyBackup);
          }}>{fr.backup.downloadSafety}</button
        >
      {/if}
    </div>
  {:else if message?.kind === 'alert'}
    <div role="alert" class="error">
      <p>{message.text}</p>
      {#if message.details !== undefined}
        <ul>
          {#each message.details as detail (detail)}
            <li>{detail}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <p>
    {lastBackupAt === undefined
      ? fr.backup.neverBackedUp
      : format(fr.backup.lastBackup, { date: dateTime.format(new Date(lastBackupAt)) })}
  </p>
  <button type="button" disabled={busy} onclick={saveNow}>{fr.backup.saveNow}</button>

  {#if folder !== undefined}
    <h3>{fr.backup.folderTitle}</h3>
    <p>{fr.backup.folderHelp}</p>
    <p>
      {folderName === undefined
        ? fr.backup.noFolder
        : format(fr.backup.folderName, { name: folderName })}
    </p>
    {#if autoBackupStatus === 'permissionNeeded'}
      <p class="notice">{fr.backup.permissionNeeded}</p>
      <button type="button" onclick={reauthorize}>{fr.backup.reauthorize}</button>
    {/if}
    <div class="actions">
      <button type="button" onclick={chooseFolder}>{fr.backup.chooseFolder}</button>
      {#if folderName !== undefined}
        <button type="button" onclick={forgetFolder}>{fr.backup.forgetFolder}</button>
      {/if}
    </div>
  {/if}

  <h3>{fr.backup.restoreTitle}</h3>
  <label for="backup-file">{fr.backup.chooseFile}</label>
  <input
    id="backup-file"
    type="file"
    accept=".json,application/json"
    disabled={busy}
    bind:this={fileInput}
    onchange={readChosen}
  />

  {#if preview !== undefined}
    {@const summary = preview.summary}
    <section aria-labelledby="backup-preview-title" class="preview">
      <h4 id="backup-preview-title">{fr.backup.previewTitle}</h4>
      <ul>
        <li>
          {format(fr.backup.previewWords, {
            count: summary.wordCount,
            zh: summary.wordsByLanguage.zh,
            en: summary.wordsByLanguage.en,
          })}
        </li>
        <li>{format(fr.backup.previewLabels, { count: summary.labelCount })}</li>
        {#if summary.level !== undefined}
          <li>{format(fr.backup.previewLevel, { level: summary.level })}</li>
        {/if}
        {#if summary.streakDays !== undefined}
          <li>{format(fr.backup.previewStreak, { count: summary.streakDays })}</li>
        {/if}
        <li>
          {format(fr.backup.previewDate, {
            date: date.format(new Date(summary.exportedAt)),
            profile: summary.profileName,
            version: summary.appVersion,
          })}
        </li>
      </ul>
      <p>{fr.backup.restoreChoice}</p>
      <div class="choice">
        <button type="button" disabled={busy} onclick={() => restore('merge')}
          >{fr.backup.merge}</button
        >
        <p>{fr.backup.mergeHelp}</p>
      </div>
      <div class="choice">
        <ConfirmAction
          text={fr.backup.replace}
          label={fr.backup.replace}
          question={fr.backup.replaceQuestion}
          confirmText={fr.backup.confirmReplace}
          disabled={busy}
          onConfirm={() => restore('replace')}
        />
        <p>{fr.backup.replaceHelp}</p>
      </div>
      <button
        type="button"
        onclick={() => {
          preview = undefined;
        }}>{fr.backup.cancelRestore}</button
      >
    </section>
  {/if}
</section>

<style>
  button {
    min-height: 44px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .preview {
    border: 1px solid currentColor;
    border-radius: 0.5rem;
    padding: 0 1rem 1rem;
    margin-top: 1rem;
  }

  .choice p {
    margin: 0.25rem 0 1rem;
    font-size: 0.9rem;
  }

  .error {
    color: var(--ochre);
  }
</style>
