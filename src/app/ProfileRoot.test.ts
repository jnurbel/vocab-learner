import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeSpeaker } from '../features/dictation/dictation.fixtures';
import fr from '../i18n/fr.json';
import type { BackupFile } from '../services/backup/backupService';
import { StudyRepository } from '../storage/studyRepository';
import { VocabularyRepository } from '../storage/vocabularyRepository';
import ProfileRoot from './ProfileRoot.svelte';

type User = ReturnType<typeof userEvent.setup>;

afterEach(async () => {
  const names = await Dexie.getDatabaseNames();
  await Promise.all(names.map((name) => Dexie.delete(name)));
});

function cat() {
  const now = '2026-11-01T08:00:00.000Z';
  return {
    id: 'c1',
    language: 'zh' as const,
    term: '猫',
    pinyin: 'māo',
    translation: 'chat',
    labelIds: [],
    source: 'manual' as const,
    createdAt: now,
    updatedAt: now,
  };
}

async function openProfileMenu(user: User, name: string) {
  await user.click(await screen.findByRole('button', { name: `Profil : ${name}` }));
  return screen.getByRole('region', { name: fr.profiles.title });
}

async function createProfile(user: User, from: string, name: string) {
  const panel = await openProfileMenu(user, from);
  await user.type(within(panel).getByLabelText(fr.profiles.createInput), name);
  await user.click(within(panel).getByRole('button', { name: fr.profiles.create }));
  await screen.findByRole('button', { name: `Profil : ${name}` });
}

async function wordRows(user: User) {
  await user.click(screen.getByRole('button', { name: fr.nav.words }));
  const list = await screen.findByRole('region', { name: fr.wordList.title });
  return within(list).queryAllByRole('row');
}

describe('ProfileRoot', () => {
  it('opens the words saved before profiles existed as the profile "Moi"', async () => {
    await new VocabularyRepository('vocab-learner-default').saveImport({
      cardsToCreate: [cat()],
      cardsToUpdate: [],
    });
    const user = userEvent.setup();
    render(ProfileRoot, { speaker: new FakeSpeaker() });

    await screen.findByRole('button', { name: 'Profil : Moi' });

    expect(await wordRows(user)).toHaveLength(2);
  });

  it('keeps the words and the island of each profile apart when switching', async () => {
    await new VocabularyRepository('vocab-learner-default').saveImport({
      cardsToCreate: [cat()],
      cardsToUpdate: [],
    });
    // Level 8 is reached at 1750 XP (GAME_DESIGN.md 4.3).
    await new StudyRepository('vocab-learner-default').recordProgress(() => ({
      xp: 1750,
      islandLevelSeen: 8,
    }));
    const user = userEvent.setup();
    render(ProfileRoot, { speaker: new FakeSpeaker() });
    await screen.findByRole('button', { name: 'Profil : Moi' });

    await createProfile(user, 'Moi', 'Léa');

    expect(await wordRows(user)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: fr.nav.garden }));
    expect(await screen.findByRole('img', { name: /^Île niveau 1/ })).toBeVisible();

    const panel = await openProfileMenu(user, 'Léa');
    await user.click(within(panel).getByRole('button', { name: 'Ouvrir le profil Moi' }));
    await screen.findByRole('button', { name: 'Profil : Moi' });

    expect(await wordRows(user)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: fr.nav.garden }));
    expect(await screen.findByRole('img', { name: /^Île niveau 8/ })).toBeVisible();
  });

  it('leaves a session under way behind when switching, and reopens on the home screen', async () => {
    await new VocabularyRepository('vocab-learner-default').saveImport({
      cardsToCreate: [cat()],
      cardsToUpdate: [],
    });
    const user = userEvent.setup();
    const speaker = new FakeSpeaker();
    render(ProfileRoot, { speaker });
    await screen.findByRole('button', { name: 'Profil : Moi' });
    await user.click(screen.getByRole('button', { name: fr.nav.flashcards }));
    await user.click(await screen.findByRole('button', { name: fr.flashcards.start }));
    await screen.findByRole('button', { name: fr.flashcards.flip });

    await createProfile(user, 'Moi', 'Léa');

    expect(screen.queryByRole('button', { name: fr.flashcards.flip })).toBeNull();
    expect(screen.getByRole('button', { name: fr.nav.home })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(speaker.cancel).toHaveBeenCalled();
  });

  it('reopens on the profile used last', async () => {
    const user = userEvent.setup();
    const { unmount } = render(ProfileRoot, { speaker: new FakeSpeaker() });
    await createProfile(user, 'Moi', 'Léa');
    unmount();

    render(ProfileRoot, { speaker: new FakeSpeaker() });

    expect(await screen.findByRole('button', { name: 'Profil : Léa' })).toBeVisible();
  });

  it('names the backups after the pseudonym, even right after a renaming', async () => {
    const user = userEvent.setup();
    const download = vi.fn<(file: BackupFile) => void>();
    render(ProfileRoot, { speaker: new FakeSpeaker(), download });
    const panel = await openProfileMenu(user, 'Moi');
    await user.click(within(panel).getByRole('button', { name: 'Renommer le profil Moi' }));
    const input = within(panel).getByLabelText('Nouveau pseudo pour Moi');
    await user.clear(input);
    await user.type(input, 'Zoé');
    await user.click(within(panel).getByRole('button', { name: fr.profiles.renameSave }));
    await screen.findByRole('button', { name: 'Profil : Zoé' });

    await user.click(screen.getByRole('button', { name: fr.nav.backup }));
    await user.click(await screen.findByRole('button', { name: fr.backup.saveNow }));

    await vi.waitFor(() => {
      expect(download).toHaveBeenCalledOnce();
    });
    expect(download.mock.calls[0]?.[0].fileName).toMatch(/^vocab-learner-Zoé-/);
  });

  it('deletes the profile open after its backup, and opens another one', async () => {
    const user = userEvent.setup();
    const download = vi.fn<(file: BackupFile) => void>();
    render(ProfileRoot, { speaker: new FakeSpeaker(), download });
    await createProfile(user, 'Moi', 'Léa');
    await user.click(screen.getByRole('button', { name: fr.nav.words }));
    await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
    await user.paste('dog | chien');
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 mot' }));
    await screen.findByText('1 mot(s) ajouté(s).');

    const panel = await openProfileMenu(user, 'Léa');
    await user.click(within(panel).getByRole('button', { name: 'Supprimer le profil Léa' }));
    await user.click(within(panel).getByRole('button', { name: fr.profiles.backupFirst }));
    await vi.waitFor(() => {
      expect(download).toHaveBeenCalledOnce();
    });
    const backup = download.mock.calls[0]?.[0];
    expect(backup?.fileName).toMatch(/^vocab-learner-Léa-/);
    expect(backup?.text).toContain('"term": "dog"');
    await user.click(within(panel).getByRole('button', { name: fr.profiles.continueDelete }));
    await user.click(within(panel).getByRole('button', { name: 'Supprimer définitivement Léa' }));

    expect(await screen.findByRole('button', { name: 'Profil : Moi' })).toBeVisible();
    await vi.waitFor(async () => {
      expect(await Dexie.getDatabaseNames()).toEqual(
        expect.not.arrayContaining([expect.stringMatching(/^vocab-learner-[0-9a-f]{8}-/)]),
      );
    });
  });
});
