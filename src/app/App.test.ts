import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fr from '../i18n/fr.json';
import App from './App.svelte';

function bulkEntry(): HTMLElement {
  return screen.getByRole('region', { name: fr.bulkEntry.title });
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
});
