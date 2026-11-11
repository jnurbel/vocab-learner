import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fr from '../i18n/fr.json';
import packageJson from '../../package.json';
import type { BackupFile } from '../services/backup/backupService';
import { FakeSpeaker } from '../features/dictation/dictation.fixtures';
import { BackupMetaStore } from '../storage/backupMetaStore';
import { VocabularyRepository } from '../storage/vocabularyRepository';
import App from './App.svelte';

function bulkEntry(): HTMLElement {
  return screen.getByRole('region', { name: fr.bulkEntry.title });
}

type User = ReturnType<typeof userEvent.setup>;

/** The app opens on the home screen: the word entry is one menu click away. */
async function openWords() {
  await userEvent.setup().click(screen.getByRole('button', { name: fr.nav.words }));
}

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
  await user.click(await screen.findByRole('button', { name: fr.flashcards.start }));
  await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));
  await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));
  await screen.findByRole('heading', { name: fr.flashcards.summaryTitle });
}

describe('App', () => {
  it('shows the version of the app next to its name, on every page', () => {
    render(App, { databaseName: 'app-test-version' });

    const brand = screen.getByRole('banner');
    expect(within(brand).getByText(`v${packageJson.version}`)).toBeVisible();
    expect(within(brand).getByText(`v${packageJson.version}`)).toHaveAttribute(
      'title',
      `Version ${packageJson.version}`,
    );
  });

  it('opens on the home screen, the first entry of the menu', async () => {
    render(App, { databaseName: 'app-test-home' });

    const menu = screen.getByRole('navigation', { name: fr.nav.label });
    const [first] = within(menu).getAllByRole('button');
    expect(first).toHaveAccessibleName(fr.nav.home);
    expect(first).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { name: fr.home.noCards })).toBeVisible();
  });

  it('goes from the home screen to the word entry, then starts the session of the day', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-home-session' });

    await user.click(await screen.findByRole('button', { name: fr.home.addWords }));
    await addWord(user, '猫 | māo | chat');
    await user.click(screen.getByRole('button', { name: fr.nav.home }));
    await user.click(
      await screen.findByRole('button', { name: /^Commencer la session · ~1 min$/ }),
    );

    const flashcards = await screen.findByRole('region', { name: fr.flashcards.title });
    expect(await within(flashcards).findByText('1 / 1')).toBeVisible();
  });

  it('renders the application title from the French strings', () => {
    render(App, { databaseName: 'app-test-title' });

    expect(screen.getByRole('heading', { level: 1, name: fr.app.title })).toBeInTheDocument();
  });

  it('stores bulk-entered words so that entering them again does not duplicate them', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-bulk-entry' });
    await openWords();
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

  it('adds a word from a pasted text, and never proposes again a word known already', async () => {
    const user = userEvent.setup();
    const { unmount } = render(App, { databaseName: 'app-test-text-import' });
    await openWords();
    const textImport = screen.getByRole('region', { name: fr.textImport.title });

    await user.click(within(textImport).getByLabelText(fr.textImport.inputLabel));
    await user.paste('The moon is bright.');
    await user.type(within(textImport).getByLabelText('Sens de moon'), 'lune');
    await user.click(
      within(within(textImport).getByRole('radiogroup', { name: 'Choix pour bright' })).getByRole(
        'radio',
        { name: fr.textImport.decisions.known },
      ),
    );
    await user.click(within(textImport).getByRole('button', { name: fr.textImport.save }));
    await within(textImport).findByRole('status');
    unmount();

    render(App, { databaseName: 'app-test-text-import' });
    await openWords();
    const list = await screen.findByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /moon/ })).toHaveTextContent('lune');
    const again = screen.getByRole('region', { name: fr.textImport.title });
    await user.click(within(again).getByLabelText(fr.textImport.inputLabel));
    await user.paste('The moon is bright. The sun is hot.');

    const preview = await within(again).findByRole('table', { name: fr.textImport.previewCaption });
    await vi.waitFor(() => {
      expect(within(preview).queryByText('bright')).toBeNull();
    });
    expect(within(preview).queryByText('moon')).toBeNull();
    expect(within(preview).getByText('sun')).toBeVisible();
  });

  it('lists the saved words with their new label, still there after a restart', async () => {
    const user = userEvent.setup();
    const { unmount } = render(App, { databaseName: 'app-test-word-list' });
    await openWords();

    await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
    await user.paste('狗 || chien\nhorse | cheval');
    await user.type(within(bulkEntry()).getByLabelText(fr.labelPicker.nameInput), 'Animaux');
    await user.click(screen.getByRole('button', { name: 'Ajouter 2 mots' }));
    await screen.findByRole('status');
    unmount();

    render(App, { databaseName: 'app-test-word-list' });
    await openWords();

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
    await openWords();

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
    await openWords();

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
    await openWords();
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
    await openWords();
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
    await openWords();
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
    await openWords();
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
    await user.click(await screen.findByRole('button', { name: fr.flashcards.start }));
    await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));
    await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));
    expect(await screen.findByRole('heading', { name: fr.flashcards.summaryTitle })).toBeVisible();

    await user.click(within(menu).getByRole('button', { name: fr.nav.words }));
    const list = screen.getByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /猫/ })).toHaveTextContent(fr.stages.sprout);
  });

  it('shows the garden from the menu, with the points earned, and waters it with flashcards', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-garden' });
    await openWords();
    await addWord(user, '猫 | māo | chat');
    await studyOneCard(user);

    const menu = screen.getByRole('navigation', { name: fr.nav.label });
    await user.click(within(menu).getByRole('button', { name: fr.nav.garden }));

    // Discovered (5), right (10), session completed (30).
    expect(await screen.findByText('Île niveau 1 · 45 XP')).toBeVisible();
    const chinese = screen.getByRole('list', { name: fr.garden.plots.zh });
    expect(within(chinese).getByText('猫')).toBeVisible();
    expect(within(chinese).getByText(fr.stages.sprout)).toBeVisible();

    await user.click(screen.getByRole('button', { name: fr.garden.water }));
    expect(within(menu).getByRole('button', { name: fr.nav.flashcards })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens the list of mini-games from the garden and from the flashcards, then a game', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-mini-game' });
    const menu = screen.getByRole('navigation', { name: fr.nav.label });
    await openWords();
    await addWord(user, '猫 | māo | chat');
    await addWord(user, '狗 | gǒu | chien');

    await user.click(within(menu).getByRole('button', { name: fr.nav.garden }));
    await user.click(screen.getByRole('button', { name: fr.garden.miniGame }));
    const games = screen.getByRole('list', { name: fr.miniGames.listLabel });
    expect(screen.getByRole('region', { name: fr.miniGames.title })).toBeVisible();
    const listen = within(games)
      .getAllByRole('listitem')
      .find((item) => item.textContent.includes(fr.miniGames.games.listenMeaning.name));
    if (listen === undefined) {
      throw new Error('ListenMeaning is not listed');
    }

    await user.click(within(listen).getByRole('button', { name: /Jouer/ }));
    expect(screen.getByRole('region', { name: fr.listenMeaning.title })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.miniGames.back }));
    expect(screen.getByRole('region', { name: fr.miniGames.title })).toBeVisible();

    await user.click(within(menu).getByRole('button', { name: fr.nav.flashcards }));
    await user.click(await screen.findByRole('button', { name: fr.garden.miniGame }));
    expect(screen.getByRole('region', { name: fr.miniGames.title })).toBeVisible();
  });

  it('remembers how the learner answers the flashcards, from one visit to the next', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-answer-mode' });
    await openWords();
    const menu = screen.getByRole('navigation', { name: fr.nav.label });
    await user.click(within(menu).getByRole('button', { name: fr.nav.flashcards }));
    await user.click(
      await screen.findByRole('radio', { name: fr.flashcards.answerModes.typeMeaning }),
    );
    await user.click(screen.getByRole('button', { name: fr.flashcards.start }));
    await screen.findByText(fr.flashcards.nothingDue);

    await user.click(within(menu).getByRole('button', { name: fr.nav.words }));
    await user.click(within(menu).getByRole('button', { name: fr.nav.flashcards }));

    expect(
      await screen.findByRole('radio', { name: fr.flashcards.answerModes.typeMeaning }),
    ).toBeChecked();
  });

  it('reminds to back up once something changed, and the reminder can be hidden', async () => {
    const user = userEvent.setup();
    render(App, { databaseName: 'app-test-reminder', download: vi.fn() });
    await openWords();
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
    await openWords();
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
    await openWords();
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
    await openWords();
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
    await openWords();
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
    await openWords();
    await user.click(screen.getByRole('button', { name: fr.nav.backup }));
    expect(screen.queryByRole('button', { name: fr.backup.chooseFolder })).toBeNull();
    unmount();

    const directoryPicker = vi.fn(() =>
      Promise.reject(new DOMException('Cancelled', 'AbortError')),
    );
    render(App, { databaseName: 'app-test-folder-supported', directoryPicker });
    await openWords();
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
    await openWords();
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
    // The word list is read again once the dictation has stored its end.
    await vi.waitFor(() => {
      expect(within(list).getByRole('row', { name: /猫/ })).toHaveTextContent(fr.stages.sprout);
    });
  });

  it('changes the daily quota of new words from the settings, kept and recorded as a change', async () => {
    const user = userEvent.setup();
    const databaseName = 'app-test-settings';
    const meta = new BackupMetaStore(databaseName);
    const { unmount } = render(App, { databaseName });
    await openWords();
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
    await openWords();
    await user.click(screen.getByRole('button', { name: fr.nav.settings }));
    await vi.waitFor(() => {
      expect(screen.getByRole('combobox', { name: fr.settings.newPerDay })).toHaveValue('10');
    });
  });

  describe('labels to work on', () => {
    const created = '2026-11-01T00:00:00.000Z';

    async function seedLabel(databaseName: string, examDate: string) {
      const repository = new VocabularyRepository(databaseName);
      await repository.saveLabel({
        id: 'lesson',
        name: 'Leçon 7',
        isFocus: true,
        examDate,
        createdAt: created,
        updatedAt: created,
      });
    }

    it('unpins at start-up a label whose test was yesterday, and stores it', async () => {
      const databaseName = 'app-test-auto-unfocus';
      await seedLabel(databaseName, '2026-11-12');
      const now = () => new Date('2026-11-13T10:00:00+01:00');

      render(App, { databaseName, now });
      await userEvent.setup().click(screen.getByRole('button', { name: fr.nav.words }));

      expect(await screen.findByRole('button', { name: 'Épingler Leçon 7' })).toBeVisible();
      const [stored] = await new VocabularyRepository(databaseName).allLabels();
      expect(stored).toMatchObject({ isFocus: false, pastExamDate: '2026-11-12' });
    });

    it('undoes from the home screen the unpinning of a label after its test', async () => {
      const databaseName = 'app-test-undo-unpin';
      await seedLabel(databaseName, '2026-11-12');
      await new VocabularyRepository(databaseName).saveImport({
        cardsToCreate: [
          {
            id: 'cat',
            language: 'zh',
            term: '猫',
            translation: 'chat',
            labelIds: ['lesson'],
            source: 'manual',
            createdAt: created,
            updatedAt: created,
          },
        ],
        cardsToUpdate: [],
      });
      const user = userEvent.setup();
      render(App, { databaseName, now: () => new Date('2026-11-13T10:00:00+01:00') });

      await user.click(
        await screen.findByRole('button', { name: 'Annuler le désépinglage de Leçon 7' }),
      );

      expect(await screen.findByRole('region', { name: 'Leçon 7' })).toBeVisible();
      const [stored] = await new VocabularyRepository(databaseName).allLabels();
      expect(stored).toMatchObject({ isFocus: true });
      expect(stored?.unfocusedOn).toBeUndefined();
    });

    it('keeps a label pinned on the day of its test', async () => {
      const databaseName = 'app-test-exam-day';
      await seedLabel(databaseName, '2026-11-13');

      render(App, { databaseName, now: () => new Date('2026-11-13T10:00:00+01:00') });
      await userEvent.setup().click(screen.getByRole('button', { name: fr.nav.words }));

      expect(await screen.findByRole('button', { name: 'Désépingler Leçon 7' })).toBeVisible();
    });
  });

  it('lists the voices of the browser in the settings, to explain a silent word', async () => {
    const user = userEvent.setup();
    const voices = {
      voiceReport: () =>
        Promise.resolve({
          voices: [{ name: 'Chinese China', lang: 'cmn_CN', localService: true }],
          chosen: {
            zh: { name: 'Chinese China', lang: 'cmn_CN', localService: true },
            en: undefined,
          },
        }),
      reloadVoices: vi.fn(),
    };
    render(App, { databaseName: 'app-test-voices', speaker: new FakeSpeaker(true, true), voices });

    await user.click(screen.getByRole('button', { name: fr.nav.settings }));

    const section = await screen.findByRole('region', { name: fr.voice.title });
    expect(await within(section).findByText(fr.voice.chosenZh)).toBeVisible();
  });

  it('applies the speed of the voice chosen in the settings everywhere, and keeps it', async () => {
    const user = userEvent.setup();
    const databaseName = 'app-test-voice-speed';
    const speaker = new FakeSpeaker(true, true);
    const { unmount } = render(App, { databaseName, speaker });
    await vi.waitFor(() => {
      expect(speaker.setRate).toHaveBeenCalledWith(0.7);
    });

    await user.click(screen.getByRole('button', { name: fr.nav.settings }));
    const speeds = await screen.findByRole('group', { name: fr.voice.speedLegend });
    expect(within(speeds).getByRole('radio', { name: fr.dictation.speeds.normal })).toBeChecked();
    await user.click(within(speeds).getByRole('radio', { name: fr.dictation.speeds.slow }));

    expect(await screen.findByText(fr.voice.speedSaved)).toBeVisible();
    expect(speaker.setRate).toHaveBeenLastCalledWith(0.5);
    unmount();

    const next = new FakeSpeaker(true, true);
    render(App, { databaseName, speaker: next });
    await vi.waitFor(() => {
      expect(next.setRate).toHaveBeenCalledWith(0.5);
    });
    await user.click(screen.getByRole('button', { name: fr.nav.dictation }));
    expect(await screen.findByRole('radio', { name: fr.dictation.speeds.slow })).toBeChecked();
  });
});
