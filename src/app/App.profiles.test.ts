import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { FakeSpeaker } from '../features/dictation/dictation.fixtures';
import fr from '../i18n/fr.json';
import type { BackupFile } from '../services/backup/backupService';
import App from './App.svelte';

describe('App of a profile', () => {
  it('names the backups after the pseudonym of the profile', async () => {
    const user = userEvent.setup();
    const download = vi.fn<(file: BackupFile) => void>();
    render(App, { databaseName: 'app-test-profile-backup', profileName: 'Léa', download });

    await user.click(screen.getByRole('button', { name: fr.nav.backup }));
    await user.click(await screen.findByRole('button', { name: fr.backup.saveNow }));

    await vi.waitFor(() => {
      expect(download).toHaveBeenCalledOnce();
    });
    const [file] = download.mock.calls[0] ?? [];
    expect(file?.fileName).toMatch(/^vocab-learner-Léa-\d{4}-\d{2}-\d{2}\.vocab-backup\.json$/);
    expect(JSON.parse(file?.text ?? '')).toMatchObject({ profileName: 'Léa' });
  });

  it('shows the profile menu it is given in its header', () => {
    const profileMenu = createRawSnippet(() => ({
      render: () => '<button type="button">Profil : Léa</button>',
    }));

    render(App, { databaseName: 'app-test-profile-menu', profileMenu });

    expect(screen.getByRole('banner')).toContainElement(
      screen.getByRole('button', { name: 'Profil : Léa' }),
    );
  });

  it('stops reading aloud when it is left for another profile', () => {
    const speaker = new FakeSpeaker();
    const { unmount } = render(App, { databaseName: 'app-test-profile-leave', speaker });

    unmount();

    expect(speaker.cancel).toHaveBeenCalled();
  });
});
