import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fr from '../i18n/fr.json';
import type { SharedFile, ShareOutcome } from '../services/pack/shareFile';
import App from './App.svelte';

type User = ReturnType<typeof userEvent.setup>;

function bulkEntry(): HTMLElement {
  return screen.getByRole('region', { name: fr.bulkEntry.title });
}

async function addWords(user: User, lines: string, labelName: string, count: number) {
  await user.click(screen.getByLabelText(fr.bulkEntry.inputLabel));
  await user.paste(lines);
  await user.type(within(bulkEntry()).getByLabelText(fr.labelPicker.nameInput), labelName);
  await user.click(screen.getByRole('button', { name: `Ajouter ${String(count)} mots` }));
  await within(bulkEntry()).findByRole('status');
}

async function studyOneCard(user: User) {
  await user.click(screen.getByRole('button', { name: fr.nav.flashcards }));
  await user.click(await screen.findByRole('button', { name: fr.flashcards.start }));
  await user.click(await screen.findByRole('button', { name: fr.flashcards.flip }));
  await user.click(screen.getByRole('button', { name: fr.flashcards.evaluations.good }));
  await screen.findByRole('heading', { name: fr.flashcards.summaryTitle });
}

describe('App vocabulary packs', () => {
  it('shares a label as a pack of its words, without the progress made on them', async () => {
    const user = userEvent.setup();
    const shared: SharedFile[] = [];
    const share = vi.fn((file: SharedFile): Promise<ShareOutcome> => {
      shared.push(file);
      return Promise.resolve('shared');
    });
    render(App, { databaseName: 'app-test-share-pack', share });
    await user.click(screen.getByRole('button', { name: fr.nav.words }));
    await addWords(user, '猫 | māo | chat\ndog | chien', 'Animaux', 2);
    await addWords(user, 'apple | pomme\nbook | livre', 'Leçon 7', 2);
    await studyOneCard(user);

    await user.click(screen.getByRole('button', { name: fr.nav.words }));
    await user.click(screen.getByRole('button', { name: 'Partager Animaux' }));

    expect(await screen.findByText(fr.labelManager.shared)).toBeVisible();
    expect(shared).toHaveLength(1);
    const [file] = shared;
    expect(file?.fileName).toBe('Animaux.vocab.json');
    const pack = JSON.parse(file?.text ?? '') as Record<string, unknown>;
    expect(pack).toEqual({
      format: 'vocab-learner-pack',
      version: 1,
      labels: [{ id: expect.any(String) as string, name: 'Animaux' }],
      cards: expect.arrayContaining([
        expect.objectContaining({ term: '猫', pinyin: 'māo', translation: 'chat' }),
        expect.objectContaining({ term: 'dog', translation: 'chien' }),
      ]) as unknown,
    });
    expect(file?.text).not.toMatch(/stability|reps|due|xp|createdAt|source|pomme/);
  });
});
