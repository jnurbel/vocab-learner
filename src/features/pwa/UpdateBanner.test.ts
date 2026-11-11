import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fr from '../../i18n/fr.json';
import UpdateBanner from './UpdateBanner.svelte';

describe('UpdateBanner', () => {
  it('announces the new version and tells the version in use', () => {
    render(UpdateBanner, { version: '0.8.0', onUpdate: vi.fn(), onLater: vi.fn() });

    const banner = screen.getByRole('complementary', { name: fr.pwa.updateTitle });
    expect(banner).toHaveTextContent('Tu utilises la version 0.8.0.');
    expect(banner).toHaveTextContent('tes mots et ta progression restent enregistrés');
  });

  it('updates only on a click, and shows that it is updating', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(() => new Promise<void>(() => undefined));
    render(UpdateBanner, { version: '0.8.0', onUpdate, onLater: vi.fn() });
    expect(onUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: fr.pwa.update }));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: fr.pwa.updating })).toBeDisabled();
    expect(screen.getByRole('button', { name: fr.pwa.updateLater })).toBeDisabled();
  });

  it('lets the user try again when the update failed', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(() => Promise.reject(new Error('no waiting worker')));
    render(UpdateBanner, { version: '0.8.0', onUpdate, onLater: vi.fn() });

    await user.click(screen.getByRole('button', { name: fr.pwa.update }));

    expect(await screen.findByRole('button', { name: fr.pwa.update })).toBeEnabled();
  });

  it('can wait for later', async () => {
    const user = userEvent.setup();
    const onLater = vi.fn();
    render(UpdateBanner, { version: '0.8.0', onUpdate: vi.fn(), onLater });

    await user.click(screen.getByRole('button', { name: fr.pwa.updateLater }));

    expect(onLater).toHaveBeenCalledTimes(1);
  });
});
