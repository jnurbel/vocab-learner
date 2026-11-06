import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BackupDocument } from '../../domain/backup/backupDocument';
import type { BackupSummary } from '../../domain/backup/summarizeBackup';
import { failure, success } from '../../domain/result';
import fr from '../../i18n/fr.json';
import type { BackupFile, BackupService } from '../../services/backup/backupService';
import BackupPanel from './BackupPanel.svelte';

const file: BackupFile = {
  fileName: 'vocab-learner-profil-2026-11-06.vocab-backup.json',
  text: '{}',
};
const document = { schemaVersion: 1 } as unknown as BackupDocument;
const summary: BackupSummary = {
  profileName: 'Léa',
  exportedAt: '2026-11-05T12:00:00.000Z',
  appVersion: '0.3.0',
  wordCount: 312,
  wordsByLanguage: { zh: 300, en: 12 },
  labelCount: 9,
  level: 7,
  streakDays: 12,
};

function fakeService() {
  return {
    createBackupFile: vi.fn(() => Promise.resolve(file)),
    readBackupFile: vi.fn<BackupService['readBackupFile']>(() =>
      Promise.resolve(success({ backup: document, summary })),
    ),
    restore: vi.fn((_backup: BackupDocument, mode: 'replace' | 'merge') =>
      Promise.resolve(
        mode === 'replace' ? { safetyBackup: { ...file, fileName: 'safety.json' } } : {},
      ),
    ),
  };
}

function fakeFolder(initialName?: string) {
  let name = initialName;
  return {
    chooseFolder: vi.fn(() => {
      name = 'Sauvegardes';
      return Promise.resolve<'chosen' | 'failed'>('chosen');
    }),
    folderName: vi.fn(() => Promise.resolve(name)),
    forgetFolder: vi.fn(() => {
      name = undefined;
      return Promise.resolve();
    }),
    reauthorize: vi.fn(() => Promise.resolve(true)),
  };
}

function setup(props: Record<string, unknown> = {}) {
  const service = fakeService();
  const download = vi.fn();
  const onBackedUp = vi.fn(() => Promise.resolve());
  const onRestored = vi.fn(() => Promise.resolve());
  const onReauthorized = vi.fn(() => Promise.resolve());
  render(BackupPanel, {
    service,
    download,
    lastBackupAt: undefined,
    onBackedUp,
    onRestored,
    onReauthorized,
    ...props,
  });
  return { service, download, onBackedUp, onRestored, onReauthorized, user: userEvent.setup() };
}

const chosenFile = () => new File(['{}'], 'backup.json', { type: 'application/json' });

describe('BackupPanel', () => {
  it('downloads a backup of this device and remembers when', async () => {
    const { user, download, onBackedUp } = setup();
    expect(screen.getByText(fr.backup.neverBackedUp)).toBeVisible();

    await user.click(screen.getByRole('button', { name: fr.backup.saveNow }));

    expect(download).toHaveBeenCalledWith(file);
    expect(onBackedUp).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent(file.fileName);
  });

  it('shows the date of the last backup', () => {
    setup({ lastBackupAt: '2026-11-05T12:00:00.000Z' });

    expect(screen.getByText(/Dernière sauvegarde : 05\/11\/2026/)).toBeVisible();
  });

  it('tells when the backup could not be made', async () => {
    const { user, service, onBackedUp } = setup();
    service.createBackupFile.mockRejectedValueOnce(new Error('quota'));

    await user.click(screen.getByRole('button', { name: fr.backup.saveNow }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.backup.saveFailed);
    expect(onBackedUp).not.toHaveBeenCalled();
  });

  it('previews a chosen backup before restoring it', async () => {
    const { user, service } = setup();

    await user.upload(screen.getByLabelText(fr.backup.chooseFile), chosenFile());

    expect(service.readBackupFile).toHaveBeenCalled();
    const preview = await screen.findByRole('region', { name: fr.backup.previewTitle });
    expect(preview).toHaveTextContent('312 mot(s) : 300 en chinois, 12 en anglais');
    expect(preview).toHaveTextContent('9 label(s)');
    expect(preview).toHaveTextContent('Niveau 7');
    expect(preview).toHaveTextContent('Série de 12 jour(s)');
    expect(preview).toHaveTextContent('Sauvegardé le 05/11/2026');
    expect(preview).toHaveTextContent('Léa');
  });

  it('merges a backup into the current data', async () => {
    const { user, service, onRestored } = setup();
    await user.upload(screen.getByLabelText(fr.backup.chooseFile), chosenFile());

    await user.click(await screen.findByRole('button', { name: fr.backup.merge }));

    expect(service.restore).toHaveBeenCalledWith(document, 'merge');
    expect(onRestored).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent(fr.backup.merged);
    expect(screen.queryByRole('region', { name: fr.backup.previewTitle })).toBeNull();
  });

  it('replaces the data once confirmed, and offers the previous data for download', async () => {
    const { user, service, download, onRestored } = setup();
    await user.upload(screen.getByLabelText(fr.backup.chooseFile), chosenFile());

    await user.click(await screen.findByRole('button', { name: fr.backup.replace }));
    expect(service.restore).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: fr.backup.confirmReplace }));

    expect(service.restore).toHaveBeenCalledWith(document, 'replace');
    expect(onRestored).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent(fr.backup.replaced);
    await user.click(screen.getByRole('button', { name: fr.backup.downloadSafety }));
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'safety.json' }));
  });

  it('refuses a damaged or hostile file with the reasons, without restoring anything', async () => {
    const { user, service } = setup();
    service.readBackupFile.mockResolvedValueOnce(
      failure([{ path: 'sha256', code: 'fingerprintMismatch' }]),
    );

    await user.upload(screen.getByLabelText(fr.backup.chooseFile), chosenFile());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(fr.backup.refused);
    expect(within(alert).getByText(fr.backup.issues.fingerprintMismatch)).toBeVisible();
    expect(screen.queryByRole('button', { name: fr.backup.merge })).toBeNull();
    expect(service.restore).not.toHaveBeenCalled();
  });

  it('cancels a restore from the preview', async () => {
    const { user, service } = setup();
    await user.upload(screen.getByLabelText(fr.backup.chooseFile), chosenFile());

    await user.click(await screen.findByRole('button', { name: fr.backup.cancelRestore }));

    expect(screen.queryByRole('region', { name: fr.backup.previewTitle })).toBeNull();
    expect(service.restore).not.toHaveBeenCalled();
  });

  it('tells when a restore failed, nothing having changed', async () => {
    const { user, service, onRestored } = setup();
    service.restore.mockRejectedValueOnce(new Error('aborted'));
    await user.upload(screen.getByLabelText(fr.backup.chooseFile), chosenFile());

    await user.click(await screen.findByRole('button', { name: fr.backup.merge }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.backup.restoreFailed);
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('hides the automatic backup folder when the browser cannot write into one', () => {
    setup();

    expect(screen.queryByRole('button', { name: fr.backup.chooseFolder })).toBeNull();
  });

  it('chooses a folder for the automatic backups only on a click, and can forget it', async () => {
    const folder = fakeFolder();
    const { user } = setup({ folder });
    expect(folder.chooseFolder).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: fr.backup.chooseFolder }));

    expect(folder.chooseFolder).toHaveBeenCalledOnce();
    expect(await screen.findByText('Dossier de sauvegarde : Sauvegardes')).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.backup.forgetFolder }));
    expect(folder.forgetFolder).toHaveBeenCalledOnce();
    expect(await screen.findByText(fr.backup.noFolder)).toBeVisible();
  });

  it('tells when the folder could not be chosen', async () => {
    const folder = fakeFolder();
    folder.chooseFolder.mockResolvedValueOnce('failed');
    const { user } = setup({ folder });

    await user.click(screen.getByRole('button', { name: fr.backup.chooseFolder }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.backup.folderFailed);
  });

  it('asks the access to the folder back when the browser revoked it', async () => {
    const folder = fakeFolder('Sauvegardes');
    const { user, onReauthorized } = setup({ folder, autoBackupStatus: 'permissionNeeded' });
    expect(await screen.findByText(fr.backup.permissionNeeded)).toBeVisible();

    await user.click(screen.getByRole('button', { name: fr.backup.reauthorize }));

    expect(folder.reauthorize).toHaveBeenCalledOnce();
    expect(onReauthorized).toHaveBeenCalledOnce();
  });
});
