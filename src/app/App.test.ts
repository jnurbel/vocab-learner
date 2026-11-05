import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import fr from '../i18n/fr.json';
import App from './App.svelte';

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
    await user.type(screen.getByLabelText(fr.bulkEntry.labelInput), 'Animaux');
    await user.click(screen.getByRole('button', { name: 'Ajouter 2 mots' }));
    await screen.findByRole('status');
    unmount();

    render(App, { databaseName: 'app-test-word-list' });

    const list = await screen.findByRole('table', { name: fr.wordList.caption });
    expect(within(list).getByRole('row', { name: /狗/ })).toHaveTextContent('Animaux');
    await user.selectOptions(screen.getByLabelText(fr.wordList.languageFilter), fr.languages.en);
    expect(within(list).queryByRole('row', { name: /狗/ })).toBeNull();
    expect(within(list).getByRole('row', { name: /horse/ })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Animaux' })).toBeInTheDocument();
  });
});
