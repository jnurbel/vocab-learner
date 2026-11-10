import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fr from '../../i18n/fr.json';
import InstallOffer from './InstallOffer.svelte';

describe('InstallOffer', () => {
  it('shows the install button where the browser can install', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    render(InstallOffer, { offer: 'prompt', onInstall });

    const button = screen.getByRole('button', { name: fr.pwa.install });
    expect(button).toHaveAccessibleDescription(fr.pwa.installHelp);
    await user.click(button);

    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it('gives the steps of the Share menu on iOS, without a button', async () => {
    const user = userEvent.setup();
    render(InstallOffer, { offer: 'iosHelp', onInstall: vi.fn() });

    expect(screen.queryByRole('button', { name: fr.pwa.install })).not.toBeInTheDocument();
    await user.click(screen.getByText(fr.pwa.iosTitle));

    expect(screen.getByText(fr.pwa.iosHelp)).toBeVisible();
  });

  it('shows nothing where the app cannot be installed or already is', () => {
    const { container } = render(InstallOffer, { offer: 'none', onInstall: vi.fn() });

    expect(container).toHaveTextContent('');
  });
});
