import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fr from '../i18n/fr.json';
import packageJson from '../../package.json';
import type { BackupFile } from '../services/backup/backupService';
import { FakeSpeaker } from '../features/dictation/dictation.fixtures';
import { BackupMetaStore } from '../storage/backupMetaStore';
import App from './App.svelte';

function bulkEntry(): HTMLElement {
  return screen.getByRole('region', { name: fr.bulkEntry.title });
}

type User = ReturnType<typeof userEvent.setup>;

async function addWord(user: User, line: string, labelName?: string) {
  await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
  await user.paste(line);
  if (labelName !== undefined) {
    await user.type(within(bulkEntry()).getByLabelText(fr.labelPicker.nameInput), labelName);
  }
  await user.click(screen.getByRole('button', { name: 'Ajouter 1 mot' }));
  await within(bulkEntry()).findByRole('status');
}

async function studyOneCard(user: User) {
  await user.click(screen.getByRole('button', { name: fr.nav.flashcards }));
  await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
  await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));
  await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));
  await screen.findByRole('heading', { name: fr.flashcards.summaryTitle });
}

describe('App', () => {
  it('renders the application title from the French strings', () => {
    render(App, { databaseName: 'app-test-title' });

    expect(screen.getByRole('heading', { level: 1, name: fr.app.title })).toBeInTheDocument();
  });

  it('stores bulk-entered words so that entering them again does not duplicate them', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-bulk-entry' });
    const input = screen.getByLabelText(fr.bulkEntry.inputLabel);

    await user.click(input);
    await user.paste('猫 | māo | chat\napple | pomme');
    await user.click(screen.getByRole('button', { name: 'Ajouter 2 mots' }));

    expect(await screen.findByRole('status')).toHaveTextContent('2 mot(s) ajouté(s).');
    expect(input).toHaveValue('');

    await user.click(input);
    await user.paste('猫 || chat');

    expect(
      await screen.findByText(fr.bulkEntry.existingWords.replace('{count}', '1')),
    ).toBeVisible();
  });

  it('lists the saved words with their new label, still there after a restart', async () => {
    const user = userEvent.setup();
    const { unmount } = render(App, { databaseName: 'app-test-word-list' });

    await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
    await user.paste('狗 || chien\nhorse | cheval');
    await user.type(within(bulkEntry()).getByLabelText(fr.labelPicker.nameInput), 'Animaux');
    await user.click(screen.getByRole('button', { name: 'Ajouter 2 mots' }));
    await screen.findByRole('status');
    unmount();

    render(App, { databaseName: 'app-test-word-list' });

    const list = await screen.findByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /狗/ })).toHaveTextContent('Animaux');
    await user.selectOptions(screen.getByLabelText(fr.wordList.languageFilter), fr.languages.en);
    expect(within(list).queryByRole('row', { name: /狗/ })).toBeNull();
    expect(within(list).getByRole('row', { name: /horse/ })).toBeVisible();
    expect(within(bulkEntry()).getByRole('checkbox', { name: 'Animaux' })).toBeInTheDocument();
  });

  it('asks the browser to keep the data once a first word is saved', async () => {
    const user = userEvent.setup();
    const requestPersistence = vi.fn(() => Promise.resolve());
    render(App, { databaseName: 'app-test-persistence', requestPersistence });

    expect(requestPersistence).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
    await user.paste('apple | pomme');
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 mot' }));
    await screen.findByRole('status');

    expect(requestPersistence).toHaveBeenCalled();
  });

  it('stores a word entered alone and lists it with its proposed pinyin', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-word-form' });

    await user.type(screen.getByLabelText(fr.wordForm.term), '书');
    await vi.waitFor(() => {
      expect(screen.getByLabelText(fr.wordForm.pinyin)).toHaveValue('shū');
    });
    await user.type(screen.getByLabelText(fr.wordForm.translation), 'livre');
    await user.click(screen.getByRole('button', { name: fr.wordForm.add }));

    const list = await screen.findByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /书/ })).toHaveTextContent('shū');
  });

  it('edits a word from the list and deletes another once confirmed', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-edit-delete' });
    await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
    await user.paste('apple | pomme\npear | poire');
    await user.click(screen.getByRole('button', { name: 'Ajouter 2 mots' }));
    const list = await screen.findByRole('table', { name: fr.wordList.caption });

    await user.click(within(list).getByRole('button', { name: 'Modifier apple' }));
    const editor = screen.getByRole('form', { name: 'Modifier « apple »' });
    await user.clear(within(editor).getByLabelText(fr.wordForm.translation));
    await user.type(within(editor).getByLabelText(fr.wordForm.translation), 'une pomme');
    await user.click(within(editor).getByRole('button', { name: fr.wordForm.saveChanges }));

    expect(await within(list).findByRole('row', { name: /une pomme/ })).toBeVisible();
    await vi.waitFor(() => {
      expect(screen.queryByRole('form', { name: 'Modifier « apple »' })).toBeNull();
    });

    await user.click(within(list).getByRole('button', { name: 'Supprimer pear' }));
    await user.click(screen.getByRole('button', { name: fr.wordList.confirmDeleteButton }));

    await vi.waitFor(() => {
      expect(within(list).queryByRole('row', { name: /pear/ })).toBeNull();
    });
  });

  it('deletes a label from the label screen while its words stay', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-label-manager' });
    await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
    await user.paste('apple | pomme');
    await user.type(within(bulkEntry()).getByLabelText(fr.labelPicker.nameInput), 'Fruits');
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 mot' }));
    const manager = await screen.findByRole('region', { name: fr.labelManager.title });

    await user.click(
      await within(manager).findByRole('button', { name: 'Supprimer le label Fruits' }),
    );
    await user.click(
      within(manager).getByRole('button', { name: fr.labelManager.confirmDeleteButton }),
    );

    expect(await within(manager).findByText(fr.labelManager.empty)).toBeVisible();
    const list = screen.getByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /apple/ })).not.toHaveTextContent('Fruits');
  });

  it('renames a label while other labels exist, and shows the new name on its words', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-label-rename' });
    for (const [line, labelName] of [
      ['apple | pomme', 'Fruits'],
      ['cat | chat', 'Animaux'],
    ] as const) {
      await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
      await user.paste(line);
      await user.type(within(bulkEntry()).getByLabelText(fr.labelPicker.nameInput), labelName);
      await user.click(screen.getByRole('button', { name: 'Ajouter 1 mot' }));
      await within(bulkEntry()).findByRole('status');
      await user.clear(within(bulkEntry()).getByLabelText(fr.labelPicker.nameInput));
    }
    const manager = screen.getByRole('region', { name: fr.labelManager.title });

    await user.type(within(manager).getByLabelText('Nouveau nom pour Fruits'), 'Fruits rouges');
    await user.click(within(manager).getByRole('button', { name: 'Renommer Fruits' }));

    expect(await within(manager).findByRole('status')).toHaveTextContent(fr.labelManager.saved);
    const list = screen.getByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /apple/ })).toHaveTextContent('Fruits rouges');
  });

  it('practises the entered words with flashcards from the menu, then back to the words', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-flashcards' });
    await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
    await user.paste('猫 | māo | chat');
    await user.type(within(bulkEntry()).getByLabelText(fr.labelPicker.nameInput), 'Animaux');
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 mot' }));
    await screen.findByRole('status');
    expect(await screen.findByText('Chinois : 0/1 mots maîtrisés')).toBeVisible();

    const menu = screen.getByRole('navigation', { name: fr.nav.label });
    await user.click(within(menu).getByRole('button', { name: fr.nav.flashcards }));
    expect(within(menu).getByRole('button', { name: fr.nav.flashcards })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('region', { name: fr.bulkEntry.title })).toBeNull();
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));
    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));
    expect(await screen.findByRole('heading', { name: fr.flashcards.summaryTitle })).toBeVisible();

    await user.click(within(menu).getByRole('button', { name: fr.nav.words }));
    const list = screen.getByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /猫/ })).toHaveTextContent(fr.stages.sprout);
  });

  it('reminds to back up once something changed, and the reminder can be hidden', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-reminder', download: vi.fn() });
    expect(screen.queryByText(fr.backup.reminder)).toBeNull();

    await addWord(user, 'apple | pomme');

    expect(await screen.findByText(fr.backup.reminder)).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.backup.reminderDismiss }));
    expect(screen.queryByText(fr.backup.reminder)).toBeNull();
  });

  it('saves a backup from the reminder, which then goes away', async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    render(App, { databaseName: 'app-test-save-backup', download });
    await addWord(user, 'apple | pomme');

    await user.click(await screen.findByRole('button', { name: fr.backup.reminderAction }));
    expect(screen.getByRole('heading', { name: fr.backup.title })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.backup.saveNow }));

    await vi.waitFor(() => {
      expect(download).toHaveBeenCalledOnce();
    });
    const [file] = download.mock.calls[0] as [BackupFile];
    expect(file.fileName).toMatch(/^vocab-learner-profil-\d{4}-\d{2}-\d{2}\.vocab-backup\.json$/);
    expect(JSON.parse(file.text)).toMatchObject({ appVersion: packageJson.version });
    await vi.waitFor(() => {
      expect(screen.queryByText(fr.backup.reminder)).toBeNull();
    });
  });

  it('finds the words and their progress back from a backup on an empty device', async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    const first = render(App, { databaseName: 'app-test-backup-source', download });
    await addWord(user, '猫 | māo | chat');
    await studyOneCard(user);
    await user.click(screen.getByRole('button', { name: fr.nav.backup }));
    await user.click(screen.getByRole('button', { name: fr.backup.saveNow }));
    await vi.waitFor(() => {
      expect(download).toHaveBeenCalledOnce();
    });
    const [file] = download.mock.calls[0] as [BackupFile];
    first.unmount();

    render(App, { databaseName: 'app-test-backup-target', download: vi.fn() });
    await user.click(screen.getByRole('button', { name: fr.nav.backup }));
    await user.upload(
      screen.getByLabelText(fr.backup.chooseFile),
      new File([file.text], file.fileName, { type: 'application/json' }),
    );
    await user.click(await screen.findByRole('button', { name: fr.backup.merge }));
    expect(await screen.findByText(fr.backup.merged)).toBeVisible();

    await user.click(screen.getByRole('button', { name: fr.nav.words }));
    const list = await screen.findByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /猫/ })).toHaveTextContent(fr.stages.sprout);
  });

  it('records a change after an entry, a flashcard answer, a label change and a deletion', async () => {
    const user = userEvent.setup();
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 10, 6, 10, 0, tick++));
    const databaseName = 'app-test-record-change';
    const meta = new BackupMetaStore(databaseName);
    render(App, { databaseName, download: vi.fn(), now });
    const changes: (string | undefined)[] = [];
    const lastChange = async () => {
      await vi.waitFor(async () => {
        expect(await meta.lastChangeAt()).not.toBe(changes.at(-1));
      });
      changes.push(await meta.lastChangeAt());
    };

    await addWord(user, '猫 | māo | chat', 'Animaux');
    await lastChange();
    await studyOneCard(user);
    await lastChange();
    await user.click(screen.getByRole('button', { name: fr.nav.words }));
    const manager = screen.getByRole('region', { name: fr.labelManager.title });
    await user.type(within(manager).getByLabelText('Nouveau nom pour Animaux'), 'Bêtes');
    await user.click(within(manager).getByRole('button', { name: 'Renommer Animaux' }));
    await lastChange();
    const list = screen.getByRole('table', { name: fr.wordList.caption });
    await user.click(within(list).getByRole('button', { name: 'Supprimer 猫' }));
    await user.click(screen.getByRole('button', { name: fr.wordList.confirmDeleteButton }));
    await lastChange();

    expect(new Set(changes).size).toBe(4);
  });

  it('offers the automatic backup folder only where the browser can write into one', async () => {
    const user = userEvent.setup();
    const { unmount } = render(App, { databaseName: 'app-test-folder-unsupported' });
    await user.click(screen.getByRole('button', { name: fr.nav.backup }));
    expect(screen.queryByRole('button', { name: fr.backup.chooseFolder })).toBeNull();
    unmount();

    const directoryPicker = vi.fn(() =>
      Promise.reject(new DOMException('Cancelled', 'AbortError')),
    );
    render(App, { databaseName: 'app-test-folder-supported', directoryPicker });
    await user.click(screen.getByRole('button', { name: fr.nav.backup }));
    await user.click(screen.getByRole('button', { name: fr.backup.chooseFolder }));

    expect(directoryPicker).toHaveBeenCalledOnce();
    expect(await screen.findByText(fr.backup.noFolder)).toBeVisible();
  });

  it('dictates the entered words from the menu, and the answer counts as a change to back up', async () => {
    const user = userEvent.setup();
    const databaseName = 'app-test-dictation';
    const meta = new BackupMetaStore(databaseName);
    render(App, { databaseName, download: vi.fn(), speaker: new FakeSpeaker(true, true) });
    await addWord(user, '猫 | māo | chat');
    await vi.waitFor(async () => {
      expect(await meta.lastChangeAt()).toBeDefined();
    });
    const changedBefore = await meta.lastChangeAt();

    const menu = screen.getByRole('navigation', { name: fr.nav.label });
    await user.click(within(menu).getByRole('button', { name: fr.nav.dictation }));
    await user.click(screen.getByRole('button', { name: fr.dictation.start }));
    const field = await screen.findByRole('textbox', { name: fr.dictation.answerLabel });
    await user.type(field, '猫{Enter}');
    expect(await screen.findByText(fr.dictation.correct)).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.dictation.continue }));
    expect(await screen.findByText('Score : 1 / 1')).toBeVisible();

    await vi.waitFor(async () => {
      expect(await meta.lastChangeAt()).not.toBe(changedBefore);
    });
    await user.click(within(menu).getByRole('button', { name: fr.nav.words }));
    const list = screen.getByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /猫/ })).toHaveTextContent(fr.stages.sprout);
  });

  it('changes the daily quota of new words from the settings, kept and recorded as a change', async () => {
    const user = userEvent.setup();
    const databaseName = 'app-test-settings';
    const meta = new BackupMetaStore(databaseName);
    const { unmount } = render(App, { databaseName });
    const menu = screen.getByRole('navigation', { name: fr.nav.label });

    await user.click(within(menu).getByRole('button', { name: fr.nav.settings }));
    const quota = await screen.findByRole('combobox', { name: fr.settings.newPerDay });
    await vi.waitFor(() => {
      expect(quota).toHaveValue('5');
    });
    await user.selectOptions(quota, '10');

    expect(await screen.findByText(fr.settings.saved)).toBeVisible();
    expect(await meta.lastChangeAt()).toBeDefined();
    unmount();

    render(App, { databaseName });
    await user.click(screen.getByRole('button', { name: fr.nav.settings }));
    await vi.waitFor(() => {
      expect(screen.getByRole('combobox', { name: fr.settings.newPerDay })).toHaveValue('10');
    });
  });
});
