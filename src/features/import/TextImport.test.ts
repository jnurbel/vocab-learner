import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { IgnoredTerm } from '../../domain/progressRecords';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';
import TextImport from './TextImport.svelte';

const now = '2026-11-10T12:00:00.000Z';

function makeCard(term: string, language: Card['language'] = 'zh'): Card {
  return {
    id: `card-${term}`,
    language,
    term,
    translation: 'x',
    labelIds: [],
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

function setup(options: { cards?: Card[]; ignored?: IgnoredTerm[]; initialText?: string } = {}) {
  const onSave = vi.fn(() => Promise.resolve());
  const loadIgnoredTerms = vi.fn(() => Promise.resolve(options.ignored ?? []));
  let sequence = 0;
  render(TextImport, {
    existingCards: options.cards ?? [],
    existingLabels: [],
    loadPinyin: () => Promise.resolve((hanzi: string) => `auto(${hanzi})`),
    loadIgnoredTerms,
    newId: () => {
      sequence += 1;
      return `id-${String(sequence)}`;
    },
    clock: () => now,
    onSave,
    ...(options.initialText === undefined ? {} : { initialText: options.initialText }),
  });
  return { onSave, loadIgnoredTerms, user: userEvent.setup() };
}

async function pasteText(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByLabelText(fr.textImport.inputLabel));
  await user.paste(text);
}

function preview() {
  return screen.getByRole('table', { name: fr.textImport.previewCaption });
}

function termsShown(): string[] {
  return within(preview())
    .getAllByRole('rowheader')
    .map((header) => header.querySelector('.term')?.textContent ?? '');
}

function wordRow(term: string): HTMLElement {
  const row = within(preview())
    .getAllByRole('row')
    .find((candidate) => candidate.querySelector('.term')?.textContent === term);
  if (row === undefined) {
    throw new Error(`No row for ${term}`);
  }
  return row;
}

async function decide(
  user: ReturnType<typeof userEvent.setup>,
  term: string,
  decision: keyof typeof fr.textImport.decisions,
) {
  await user.click(
    within(wordRow(term)).getByRole('radio', { name: fr.textImport.decisions[decision] }),
  );
}

describe('TextImport', () => {
  it('proposes only the words of the text that are neither in the list nor ignored', async () => {
    const { user } = setup({
      cards: [makeCard('月饼'), makeCard('cat', 'en')],
      ignored: [{ language: 'zh', term: '我们' }],
    });

    await pasteText(user, '我们吃月饼。Cats eat cake.');

    await vi.waitFor(() => {
      expect(termsShown()).toEqual(['吃', 'eat', 'cake']);
    });
  });

  it('shows how many times each word appears and the sentence where it appears', async () => {
    const { user } = setup();

    await pasteText(user, 'The moon is bright. A moon rises.');

    const moon = wordRow('moon');
    expect(moon).toHaveTextContent('2');
    expect(moon).toHaveTextContent('The moon is bright.');
  });

  it('hides the very common words on request', async () => {
    const { user } = setup();

    await pasteText(user, 'The moon is bright.');
    await user.click(screen.getByRole('checkbox', { name: fr.textImport.hideCommonWords }));

    expect(termsShown()).toEqual(['moon', 'bright']);
  });

  it('proposes the pinyin of the Chinese words', async () => {
    const { user } = setup();

    await pasteText(user, '我们吃月饼。');

    await vi.waitFor(() => {
      expect(
        screen.getByLabelText(format(fr.textImport.pinyinLabel, { term: '月饼' })),
      ).toHaveValue('auto(月饼)');
    });
  });

  it('adds a word with its meaning, its pinyin and its sentence as example', async () => {
    const { user, onSave } = setup();

    await pasteText(user, '我们吃月饼。');
    await vi.waitFor(() => {
      expect(
        screen.getByLabelText(format(fr.textImport.pinyinLabel, { term: '月饼' })),
      ).toHaveValue('auto(月饼)');
    });
    await user.type(
      screen.getByLabelText(format(fr.textImport.translationLabel, { term: '月饼' })),
      'gâteau de lune',
    );
    await user.click(screen.getByRole('button', { name: fr.textImport.save }));

    expect(onSave).toHaveBeenCalledWith({
      newLabel: undefined,
      ignoredTerms: [],
      changes: {
        cardsToCreate: [
          {
            id: 'id-2',
            language: 'zh',
            term: '月饼',
            pinyin: 'auto(月饼)',
            translation: 'gâteau de lune',
            example: '我们吃月饼。',
            labelIds: [],
            source: 'manual',
            createdAt: now,
            updatedAt: now,
          },
        ],
        cardsToUpdate: [],
      },
    });
  });

  it('chooses "Add" for a word as soon as its meaning is typed, and lets the learner change it', async () => {
    const { user } = setup();

    await pasteText(user, 'The moon is bright.');
    const moon = wordRow('moon');
    expect(within(moon).getByRole('radio', { name: fr.textImport.decisions.skip })).toBeChecked();

    await user.type(
      screen.getByLabelText(format(fr.textImport.translationLabel, { term: 'moon' })),
      'lune',
    );

    expect(within(moon).getByRole('radio', { name: fr.textImport.decisions.add })).toBeChecked();
  });

  it('saves the words marked "I already know it", and stops proposing them', async () => {
    const { user, onSave, loadIgnoredTerms } = setup();

    await pasteText(user, 'The moon is bright.');
    await decide(user, 'moon', 'known');
    loadIgnoredTerms.mockResolvedValue([{ language: 'en', term: 'moon' }]);
    await user.click(screen.getByRole('button', { name: fr.textImport.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoredTerms: [{ language: 'en', term: 'moon' }],
        changes: { cardsToCreate: [], cardsToUpdate: [] },
      }),
    );
    await vi.waitFor(() => {
      expect(termsShown()).not.toContain('moon');
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      format(fr.textImport.saved, { added: 0, known: 1 }),
    );
  });

  it('does not save while a word to add has no meaning, and says which', async () => {
    const { user } = setup();

    await pasteText(user, 'The moon is bright.');
    await decide(user, 'moon', 'add');

    expect(screen.getByRole('button', { name: fr.textImport.save })).toBeDisabled();
    expect(screen.getByRole('list', { name: fr.textImport.errorsTitle })).toHaveTextContent(
      `moon : ${fr.bulkEntry.errors.missingTranslation}`,
    );
  });

  it('joins a badly cut word with the word that follows it', async () => {
    const { user } = setup();

    await pasteText(user, '今天是中秋节。');
    await user.click(
      screen.getByRole('button', {
        name: format(fr.textImport.join, { first: '中秋', second: '节' }),
      }),
    );

    expect(termsShown()).toEqual(['今天是', '中秋节']);
  });

  it('cuts a badly cut word in two', async () => {
    const { user } = setup();

    await pasteText(user, '今天是中秋节。');
    await user.click(
      screen.getByRole('button', {
        name: format(fr.textImport.split, { first: '今天', second: '是' }),
      }),
    );

    expect(termsShown()).toEqual(['今天', '是', '中秋', '节']);
  });

  it('refuses a text longer than 20 000 characters', async () => {
    const { user } = setup();

    await pasteText(user, 'a'.repeat(20_001));

    expect(screen.getByRole('alert')).toHaveTextContent(fr.textImport.inputErrors.inputTooLong);
  });

  it('shows pasted markup as plain text and never as HTML', async () => {
    const { user } = setup();

    await pasteText(user, '<img src=x onerror="alert(1)"> <b>bold</b> words.');

    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
    expect(termsShown()).toContain('bold');
  });

  it('starts from a text given by another import, such as a photo', () => {
    setup({ initialText: 'The moon is bright.' });

    expect(termsShown()).toEqual(['the', 'moon', 'is', 'bright']);
  });

  it('reports a failed save and keeps the choices', async () => {
    const { user, onSave } = setup();
    onSave.mockRejectedValueOnce(new Error('quota'));

    await pasteText(user, 'The moon is bright.');
    await decide(user, 'moon', 'known');
    await user.click(screen.getByRole('button', { name: fr.textImport.save }));

    expect(screen.getByRole('alert')).toHaveTextContent(fr.textImport.saveFailed);
    expect(
      within(wordRow('moon')).getByRole('radio', { name: fr.textImport.decisions.known }),
    ).toBeChecked();
  });
});
