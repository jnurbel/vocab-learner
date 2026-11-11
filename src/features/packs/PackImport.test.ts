import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import fr from '../../i18n/fr.json';
import PackImport from './PackImport.svelte';

const before = '2026-01-01T00:00:00.000Z';
const now = '2026-11-10T08:00:00.000Z';

function packFile(content: unknown, name = 'Leçon-7.vocab.json'): File {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return new File([text], name, { type: 'application/json' });
}

const lessonPack = {
  format: 'vocab-learner-pack',
  version: 1,
  labels: [{ id: 'p-lesson', name: 'Leçon 7' }],
  cards: [
    { language: 'zh', term: '猫', pinyin: 'māo', translation: 'chat', labelIds: ['p-lesson'] },
    { language: 'en', term: 'dog', translation: 'chien', labelIds: ['p-lesson'] },
  ],
};

function setup(existingCards: Card[] = [], existingLabels: Label[] = []) {
  let next = 0;
  const onSave = vi.fn(() => Promise.resolve());
  render(PackImport, {
    existingCards,
    existingLabels,
    newId: () => `id-${String((next += 1))}`,
    clock: () => now,
    onSave,
  });
  return { onSave, user: userEvent.setup() };
}

function region() {
  return screen.getByRole('region', { name: 'Importer une liste partagée' });
}

describe('PackImport', () => {
  it('previews the words of a pack, then imports them with their label', async () => {
    const { onSave, user } = setup();

    await user.upload(
      screen.getByLabelText('Choisir une liste de mots (.vocab.json)'),
      packFile(lessonPack),
    );

    const preview = await within(region()).findByRole('table', { name: 'Mots de la liste' });
    expect(within(preview).getAllByRole('row')).toHaveLength(3);
    expect(within(preview).getByRole('row', { name: /猫/ })).toHaveTextContent('Nouveau');
    expect(region()).toHaveTextContent('Labels créés : Leçon 7');
    await user.click(screen.getByRole('button', { name: 'Importer 2 mots' }));

    expect(onSave).toHaveBeenCalledWith({
      newLabels: [expect.objectContaining({ name: 'Leçon 7' })],
      changes: {
        cardsToCreate: [
          expect.objectContaining({ term: '猫', labelIds: ['id-1'] }),
          expect.objectContaining({ term: 'dog', labelIds: ['id-1'] }),
        ],
        cardsToUpdate: [],
      },
    });
    expect(await within(region()).findByRole('status')).toHaveTextContent(
      '2 mot(s) ajouté(s), 0 mot(s) déjà connu(s) étiqueté(s).',
    );
    expect(within(region()).queryByRole('table')).toBeNull();
  });
});

function knownCard(id: string, term: string, labelIds: string[], language: 'zh' | 'en'): Card {
  return {
    id,
    language,
    term,
    translation: 'déjà là',
    labelIds,
    source: 'manual',
    createdAt: before,
    updatedAt: before,
  };
}

const fileInput = () => screen.getByLabelText('Choisir une liste de mots (.vocab.json)');

describe('PackImport with words already known', () => {
  it('gives the labels to the known words and reuses the label of the same name', async () => {
    const lesson: Label = {
      id: 'mine',
      name: 'leçon 7',
      isFocus: false,
      createdAt: before,
      updatedAt: before,
    };
    const cat = knownCard('c1', '猫', [], 'zh');
    const dog = knownCard('c2', 'Dog', ['mine'], 'en');
    const { onSave, user } = setup([cat, dog], [lesson]);

    await user.upload(fileInput(), packFile(lessonPack));

    const preview = await within(region()).findByRole('table', { name: 'Mots de la liste' });
    expect(within(preview).getByRole('row', { name: /猫/ })).toHaveTextContent(
      'Déjà connu : reçoit les labels',
    );
    expect(within(preview).getByRole('row', { name: /dog/ })).toHaveTextContent('Déjà connu');
    expect(region()).toHaveTextContent('Labels déjà présents, réutilisés : Leçon 7');
    expect(region()).toHaveTextContent('1 mot(s) déjà connu(s) recevront les labels');
    await user.click(screen.getByRole('button', { name: 'Ajouter les labels' }));

    expect(onSave).toHaveBeenCalledWith({
      newLabels: [],
      changes: {
        cardsToCreate: [],
        cardsToUpdate: [{ ...cat, labelIds: ['mine'], updatedAt: now }],
      },
    });
  });

  it('has nothing to import when every word is already there with its labels', async () => {
    const lesson: Label = {
      id: 'mine',
      name: 'Leçon 7',
      isFocus: false,
      createdAt: before,
      updatedAt: before,
    };
    const { user } = setup(
      [knownCard('c1', '猫', ['mine'], 'zh'), knownCard('c2', 'dog', ['mine'], 'en')],
      [lesson],
    );

    await user.upload(fileInput(), packFile(lessonPack));

    expect(await within(region()).findByText(fr.packImport.nothingToDo)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ajouter les labels' })).toBeDisabled();
  });
});

describe('PackImport refuses hostile files', () => {
  it.each([
    [
      'a prototype pollution attempt',
      JSON.stringify(lessonPack).replace('{', '{"__proto__":{"x":1},'),
    ],
    ['progress smuggled in', JSON.stringify({ ...lessonPack, progress: { xp: 9999 } })],
    [
      'a bidi override',
      JSON.stringify(lessonPack).replace('chien', `chi${String.fromCodePoint(0x202e)}en`),
    ],
    ['a control character', JSON.stringify(lessonPack).replace('chien', String.raw`chi\u0007en`)],
    ['broken JSON', '{"format":'],
  ])('shows why a file with %s is refused, and imports nothing', async (_name, text) => {
    const { onSave } = setup();

    await userEvent.setup().upload(fileInput(), packFile(text));

    const alert = await within(region()).findByRole('alert');
    expect(alert).toHaveTextContent(fr.packImport.errorsTitle);
    expect(within(region()).queryByRole('table')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });

  it('refuses a file too large before reading it', async () => {
    setup();
    const huge = packFile('x');
    Object.defineProperty(huge, 'size', { value: 3_000_000 });
    const text = vi.spyOn(huge, 'text');

    await userEvent.setup().upload(fileInput(), huge);

    expect(await within(region()).findByRole('alert')).toHaveTextContent(
      fr.packImport.issues.fileTooLarge,
    );
    expect(text).not.toHaveBeenCalled();
  });

  it('says so when the file cannot be read', async () => {
    setup();
    const unreadable = packFile('x');
    vi.spyOn(unreadable, 'text').mockRejectedValue(new Error('gone'));

    await userEvent.setup().upload(fileInput(), unreadable);

    expect(await within(region()).findByRole('alert')).toHaveTextContent(
      fr.packImport.issues.unreadableFile,
    );
  });
});

describe('PackImport choices', () => {
  it('sets a pack aside without importing anything', async () => {
    const { onSave, user } = setup();
    await user.upload(fileInput(), packFile(lessonPack));
    await within(region()).findByRole('table');

    await user.click(screen.getByRole('button', { name: fr.packImport.cancel }));

    expect(within(region()).queryByRole('table')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the preview and says so when the import cannot be saved', async () => {
    const { onSave, user } = setup();
    onSave.mockRejectedValueOnce(new Error('disk full'));
    await user.upload(fileInput(), packFile(lessonPack));

    await user.click(await screen.findByRole('button', { name: 'Importer 2 mots' }));

    expect(await within(region()).findByRole('alert')).toHaveTextContent(fr.packImport.saveFailed);
    expect(within(region()).getByRole('table')).toBeVisible();
  });

  it('clears the preview when the choice of file is emptied', async () => {
    const { user } = setup();
    await user.upload(fileInput(), packFile(lessonPack));
    await within(region()).findByRole('table');

    await user.upload(fileInput(), []);

    expect(within(region()).queryByRole('table')).toBeNull();
  });

  it('imports a single word with a singular button', async () => {
    const { user } = setup();
    const single = { ...lessonPack, cards: [lessonPack.cards[1]] };

    await user.upload(fileInput(), packFile(single));

    expect(await screen.findByRole('button', { name: 'Importer 1 mot' })).toBeEnabled();
  });
});
