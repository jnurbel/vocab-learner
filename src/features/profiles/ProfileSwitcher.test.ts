import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../domain/profile';
import fr from '../../i18n/fr.json';
import ProfileSwitcher from './ProfileSwitcher.svelte';

const now = '2026-11-10T08:00:00.000Z';
const me: Profile = { id: 'default', displayName: 'Moi', createdAt: now };
const tom: Profile = { id: 'tom-1', displayName: 'Tom', createdAt: now };

function setup(profiles: Profile[] = [me, tom], current: Profile = me) {
  const handlers = {
    onSwitch: vi.fn(() => Promise.resolve()),
    onCreate: vi.fn(() => Promise.resolve()),
    onRename: vi.fn(() => Promise.resolve()),
    onDelete: vi.fn(() => Promise.resolve()),
    onBackup: vi.fn(() => Promise.resolve()),
  };
  render(ProfileSwitcher, {
    profiles,
    current,
    newId: () => 'new-id',
    clock: () => now,
    ...handlers,
  });
  return { ...handlers, user: userEvent.setup() };
}

const panel = () => screen.getByRole('region', { name: fr.profiles.title });

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Profil : Moi' }));
}

describe('ProfileSwitcher', () => {
  it('shows the pseudonym of the current profile, the menu closed', () => {
    setup();

    const toggle = screen.getByRole('button', { name: 'Profil : Moi' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: fr.profiles.title })).toBeNull();
  });

  it('lists the profiles and switches to another one', async () => {
    const { onSwitch, user } = setup();

    await openMenu(user);
    expect(screen.getByRole('button', { name: 'Profil : Moi' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(panel()).getByText(fr.profiles.current)).toBeVisible();
    await user.click(within(panel()).getByRole('button', { name: 'Ouvrir le profil Tom' }));

    expect(onSwitch).toHaveBeenCalledWith(tom);
    expect(within(panel()).queryByRole('button', { name: 'Ouvrir le profil Moi' })).toBeNull();
  });

  it('closes with the Escape key and gives the focus back to its button', async () => {
    const { user } = setup();
    await openMenu(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('region', { name: fr.profiles.title })).toBeNull();
    expect(screen.getByRole('button', { name: 'Profil : Moi' })).toHaveFocus();
  });
});

describe('ProfileSwitcher creation', () => {
  it('creates a profile with a free pseudonym, without asking for a real name', async () => {
    const { onCreate, user } = setup();
    await openMenu(user);

    const input = within(panel()).getByLabelText(fr.profiles.createInput);
    expect(input).toHaveAttribute('maxlength', '30');
    expect(input).toHaveAttribute('autocomplete', 'off');
    await user.type(input, '  Petit dragon ');
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.create }));

    expect(onCreate).toHaveBeenCalledWith({
      id: 'new-id',
      displayName: 'Petit dragon',
      createdAt: now,
    });
    expect(await within(panel()).findByRole('status')).toHaveTextContent(
      'Profil « Petit dragon » créé.',
    );
    expect(input).toHaveValue('');
  });

  it.each([
    ['', fr.profiles.errors.required],
    ['tom', fr.profiles.errors.nameTaken],
    [`Léa${String.fromCodePoint(0x202e)}`, fr.profiles.errors.invalidCharacters],
  ])('refuses the pseudonym %j and says why', async (name, message) => {
    const { onCreate, user } = setup();
    await openMenu(user);

    if (name !== '') {
      await user.type(within(panel()).getByLabelText(fr.profiles.createInput), name);
    }
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.create }));

    expect(within(panel()).getByRole('alert')).toHaveTextContent(message);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('says so when the profile cannot be saved', async () => {
    const { onCreate, user } = setup();
    onCreate.mockRejectedValueOnce(new Error('quota'));
    await openMenu(user);

    await user.type(within(panel()).getByLabelText(fr.profiles.createInput), 'Léa');
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.create }));

    expect(await within(panel()).findByRole('alert')).toHaveTextContent(fr.profiles.failed);
  });
});

describe('ProfileSwitcher renaming', () => {
  it('renames a profile', async () => {
    const { onRename, user } = setup();
    await openMenu(user);

    await user.click(within(panel()).getByRole('button', { name: 'Renommer le profil Tom' }));
    const input = within(panel()).getByLabelText('Nouveau pseudo pour Tom');
    expect(input).toHaveValue('Tom');
    await user.clear(input);
    await user.type(input, 'Thomas');
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.renameSave }));

    expect(onRename).toHaveBeenCalledWith({ ...tom, displayName: 'Thomas' });
    expect(await within(panel()).findByRole('status')).toHaveTextContent(
      'Profil renommé : « Thomas ».',
    );
    expect(within(panel()).queryByLabelText('Nouveau pseudo pour Tom')).toBeNull();
  });

  it('refuses the pseudonym of another profile', async () => {
    const { onRename, user } = setup();
    await openMenu(user);

    await user.click(within(panel()).getByRole('button', { name: 'Renommer le profil Tom' }));
    const input = within(panel()).getByLabelText('Nouveau pseudo pour Tom');
    await user.clear(input);
    await user.type(input, 'MOI');
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.renameSave }));

    expect(within(panel()).getByRole('alert')).toHaveTextContent(fr.profiles.errors.nameTaken);
    expect(onRename).not.toHaveBeenCalled();
  });

  it('gives up a renaming', async () => {
    const { onRename, user } = setup();
    await openMenu(user);

    await user.click(within(panel()).getByRole('button', { name: 'Renommer le profil Tom' }));
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.cancel }));

    expect(within(panel()).queryByLabelText('Nouveau pseudo pour Tom')).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });
});

describe('ProfileSwitcher deletion', () => {
  it('asks twice before deleting a profile, and offers its backup first', async () => {
    const { onDelete, onBackup, user } = setup();
    await openMenu(user);

    await user.click(within(panel()).getByRole('button', { name: 'Supprimer le profil Tom' }));
    const first = within(panel()).getByRole('group', { name: /Supprimer le profil « Tom »/ });
    await user.click(within(first).getByRole('button', { name: fr.profiles.backupFirst }));
    expect(onBackup).toHaveBeenCalledWith(tom);
    expect(await within(panel()).findByRole('status')).toHaveTextContent(
      'Sauvegarde de « Tom » téléchargée.',
    );
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(within(first).getByRole('button', { name: fr.profiles.continueDelete }));
    const second = within(panel()).getByRole('group', { name: /Dernière vérification/ });
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(within(second).getByRole('button', { name: 'Supprimer définitivement Tom' }));

    expect(onDelete).toHaveBeenCalledWith(tom);
    expect(await within(panel()).findByRole('status')).toHaveTextContent(
      'Profil « Tom » supprimé.',
    );
  });

  it('cancels a deletion at either step, focusing the cancel button first', async () => {
    const { onDelete, user } = setup();
    await openMenu(user);

    await user.click(within(panel()).getByRole('button', { name: 'Supprimer le profil Tom' }));
    expect(within(panel()).getByRole('button', { name: fr.profiles.cancel })).toHaveFocus();
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.cancel }));
    expect(within(panel()).queryByRole('group')).toBeNull();

    await user.click(within(panel()).getByRole('button', { name: 'Supprimer le profil Tom' }));
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.continueDelete }));
    expect(within(panel()).getByRole('button', { name: fr.profiles.cancel })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(within(panel()).queryByRole('group')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('never offers to delete the only profile', async () => {
    const { user } = setup([me]);
    await openMenu(user);

    expect(within(panel()).queryByRole('button', { name: /Supprimer le profil/ })).toBeNull();
  });

  it('says so when the backup or the deletion fails', async () => {
    const { onDelete, onBackup, user } = setup();
    onBackup.mockRejectedValueOnce(new Error('no space'));
    onDelete.mockRejectedValueOnce(new Error('blocked'));
    await openMenu(user);

    await user.click(within(panel()).getByRole('button', { name: 'Supprimer le profil Tom' }));
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.backupFirst }));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent(fr.profiles.failed);
    await user.click(within(panel()).getByRole('button', { name: fr.profiles.continueDelete }));
    await user.click(within(panel()).getByRole('button', { name: 'Supprimer définitivement Tom' }));

    expect(await within(panel()).findByRole('alert')).toHaveTextContent(fr.profiles.failed);
  });
});
