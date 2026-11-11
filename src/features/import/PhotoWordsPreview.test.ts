import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Box } from '../../domain/photo/photoBlocks';
import type { PhotoWord } from '../../domain/photo/photoWords';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';
import PhotoWordsPreview from './PhotoWordsPreview.svelte';

const now = '2026-11-11T12:00:00.000Z';
const box = (y: number): Box => ({ x: 0, y, width: 1000, height: 100 });
const PINYIN: Readonly<Record<string, string>> = {
  政府: 'zhèngfǔ',
  控制: 'kòngzhì',
  家庭: 'jiātíng',
  政: 'zhèng',
};

function word(
  id: string,
  term: string,
  meaning: string,
  options: Partial<PhotoWord> = {},
): PhotoWord {
  return {
    id,
    box: box(Number(id) * 100),
    term,
    pinyin: PINYIN[term] ?? '',
    pinyinTyped: false,
    meaning,
    notebookPinyin: '',
    toCheck: { term: false, meaning: false },
    ...options,
  };
}

const existing: Card = {
  id: 'card-1',
  language: 'zh',
  term: '家庭',
  pinyin: 'jiātíng',
  translation: 'famille',
  labelIds: [],
  source: 'manual',
  createdAt: now,
  updatedAt: now,
};

function setup(
  words: PhotoWord[],
  options: { onAdjustZones?: () => void; failSave?: boolean } = {},
) {
  const onSave = vi.fn(() =>
    options.failSave === true ? Promise.reject(new Error('quota')) : Promise.resolve(),
  );
  let urls = 0;
  const previewUrls = {
    create: vi.fn(() => {
      urls += 1;
      return `blob:thumbnail-${String(urls)}`;
    }),
    revoke: vi.fn(),
  };
  const cropPhoto = vi.fn<(photo: Blob, box: Box) => Promise<Blob>>(() =>
    Promise.resolve(new Blob(['row'])),
  );
  let ids = 0;
  const view = render(PhotoWordsPreview, {
    words,
    photo: new Blob(['photo']),
    cropPhoto,
    previewUrls,
    existingCards: [existing],
    existingLabels: [],
    loadPinyin: () => Promise.resolve((hanzi: string) => PINYIN[hanzi] ?? ''),
    newId: () => {
      ids += 1;
      return `id-${String(ids)}`;
    },
    clock: () => now,
    onSave,
    ...(options.onAdjustZones === undefined ? {} : { onAdjustZones: options.onAdjustZones }),
  });
  return { onSave, previewUrls, cropPhoto, view, user: userEvent.setup() };
}

const cell = (column: string, line: number) =>
  screen.getByRole('textbox', {
    name: format(fr.bulkEntry.cellLabel, { column, line }),
  });

describe('PhotoWordsPreview', () => {
  it('shows each word next to its line cut from the photo, to compare at a glance', async () => {
    const { cropPhoto } = setup([
      word('1', '控制', 'contrôler'),
      word('2', '政府', 'gouvernement'),
    ]);

    const thumbnail = await screen.findByRole('img', {
      name: format(fr.photoWords.thumbnailAlt, { line: 2 }),
    });

    expect(thumbnail).toHaveAttribute('src', 'blob:thumbnail-2');
    expect(cropPhoto).toHaveBeenCalledWith(expect.any(Blob), box(200));
    expect(cell(fr.bulkEntry.columns.term, 1)).toHaveValue('控制');
    expect(cell(fr.bulkEntry.columns.pinyin, 1)).toHaveValue('kòngzhì');
    expect(cell(fr.bulkEntry.columns.translation, 2)).toHaveValue('gouvernement');
  });

  it('frees the thumbnails when closed', async () => {
    const { previewUrls, view } = setup([word('1', '控制', 'contrôler')]);
    await screen.findByRole('img', { name: format(fr.photoWords.thumbnailAlt, { line: 1 }) });

    view.unmount();

    expect(previewUrls.revoke).toHaveBeenCalledWith('blob:thumbnail-1');
  });

  it('highlights the cells to check, and goes from one to the next', async () => {
    const { user } = setup([
      word('1', '控制', 'contrôler'),
      word('2', '政府', 'gouvernemant', { toCheck: { term: false, meaning: true } }),
      word('3', '除了', 'à part', { toCheck: { term: true, meaning: false } }),
    ]);

    expect(screen.getByText(format(fr.photoWords.toCheckCount, { count: 2 }))).toBeVisible();
    expect(cell(fr.bulkEntry.columns.translation, 2)).toHaveAttribute('aria-invalid', 'true');
    expect(cell(fr.bulkEntry.columns.term, 1)).not.toHaveAttribute('aria-invalid');

    await user.click(screen.getByRole('button', { name: fr.photoWords.nextToCheck }));
    expect(cell(fr.bulkEntry.columns.translation, 2)).toHaveFocus();
    expect(screen.getByText(format(fr.photoWords.nowChecking, { line: 2 }))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: fr.photoWords.nextToCheck }));
    expect(cell(fr.bulkEntry.columns.term, 3)).toHaveFocus();
  });

  it('recomputes the pinyin when the word is corrected, and the cell is no longer to check', async () => {
    const { user } = setup([
      word('1', '政', 'gouvernement', { toCheck: { term: true, meaning: false } }),
    ]);

    await user.clear(cell(fr.bulkEntry.columns.term, 1));
    await user.type(cell(fr.bulkEntry.columns.term, 1), '政府');

    expect(cell(fr.bulkEntry.columns.pinyin, 1)).toHaveValue('zhèngfǔ');
    expect(cell(fr.bulkEntry.columns.term, 1)).not.toHaveAttribute('aria-invalid');
  });

  it('shows the pinyin of the notebook when it differs, without replacing the right one', () => {
    setup([word('1', '政府', 'gouvernement', { notebookPinyin: 'zhen fu' })]);

    expect(screen.getByText(format(fr.photoWords.notebook, { pinyin: 'zhen fu' }))).toBeVisible();
    expect(cell(fr.bulkEntry.columns.pinyin, 1)).toHaveValue('zhèngfǔ');
  });

  it('removes a wrong line, merges two lines cut apart, and adds a forgotten one', async () => {
    const { user } = setup([
      word('1', '政', 'gouver-'),
      word('2', '府', 'nement'),
      word('3', '控制', 'contrôler'),
    ]);

    await user.click(
      screen.getByRole('button', { name: format(fr.photoWords.merge, { line: 1 }) }),
    );
    expect(cell(fr.bulkEntry.columns.term, 1)).toHaveValue('政府');
    expect(cell(fr.bulkEntry.columns.translation, 1)).toHaveValue('gouver- nement');
    expect(screen.getByRole('status')).toHaveTextContent(fr.photoWords.merged);

    await user.click(
      screen.getByRole('button', { name: format(fr.photoWords.remove, { line: 2 }) }),
    );
    expect(
      screen.queryByRole('textbox', {
        name: format(fr.bulkEntry.cellLabel, { column: fr.bulkEntry.columns.term, line: 2 }),
      }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: fr.photoWords.addAtEnd }));
    expect(cell(fr.bulkEntry.columns.term, 2)).toHaveFocus();
    expect(cell(fr.bulkEntry.columns.term, 2)).toHaveValue('');
  });

  it('flags the words already in the list, which are not duplicated', () => {
    setup([word('1', '家庭', 'famille'), word('2', '控制', 'contrôler')]);

    const rowOf = (term: string) =>
      screen
        .getByRole('textbox', {
          name: format(fr.bulkEntry.cellLabel, {
            column: fr.bulkEntry.columns.term,
            line: term === '家庭' ? 1 : 2,
          }),
        })
        .closest('tr') ?? document.body;
    expect(within(rowOf('家庭')).getByText(fr.bulkEntry.status.existing)).toBeVisible();
    expect(within(rowOf('控制')).getByText(fr.bulkEntry.status.new)).toBeVisible();
  });

  it('saves nothing before "Add N words", then the new words with their label, from a photo', async () => {
    const { onSave, user } = setup([
      word('1', '控制', 'contrôler'),
      word('2', '政府', 'gouvernement'),
      word('3', '家庭', 'famille'),
    ]);
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(fr.labelPicker.nameInput), 'Leçon 5');
    await user.click(
      screen.getByRole('button', { name: format(fr.bulkEntry.addWordsMany, { count: 2 }) }),
    );

    expect(onSave).toHaveBeenCalledWith({
      newLabel: expect.objectContaining({ name: 'Leçon 5' }) as unknown,
      changes: {
        cardsToCreate: [
          expect.objectContaining({
            term: '控制',
            pinyin: 'kòngzhì',
            translation: 'contrôler',
            source: 'photo',
          }),
          expect.objectContaining({
            term: '政府',
            pinyin: 'zhèngfǔ',
            translation: 'gouvernement',
            source: 'photo',
          }),
        ] as unknown,
        cardsToUpdate: [expect.objectContaining({ term: '家庭' })] as unknown,
      },
    });
    expect(await screen.findByText(format(fr.bulkEntry.saved, { count: 2 }))).toBeVisible();
  });

  it('says when saving failed, and keeps the words to try again', async () => {
    const { user } = setup([word('1', '控制', 'contrôler')], { failSave: true });

    await user.click(screen.getByRole('button', { name: fr.bulkEntry.addWordsOne }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.bulkEntry.saveFailed);
    expect(cell(fr.bulkEntry.columns.term, 1)).toHaveValue('控制');
  });

  it('adds a forgotten word right after a given line, without a thumbnail', async () => {
    const { user } = setup([word('1', '控制', 'contrôler'), word('2', '政府', 'gouvernement')]);

    await user.click(
      screen.getByRole('button', { name: format(fr.photoWords.addAfter, { line: 1 }) }),
    );

    expect(cell(fr.bulkEntry.columns.term, 2)).toHaveFocus();
    expect(cell(fr.bulkEntry.columns.term, 3)).toHaveValue('政府');
    expect(screen.getByText(fr.photoWords.noThumbnail)).toBeVisible();
  });

  it('cannot save while a word misses its meaning, and says which line', () => {
    setup([word('1', '控制', '')]);

    expect(
      screen.getByRole('button', { name: format(fr.bulkEntry.addWordsMany, { count: 0 }) }),
    ).toBeDisabled();
    expect(screen.getByText(fr.bulkEntry.errors.missingTranslation)).toBeVisible();
  });

  it('offers to adjust the zones when many cells are to check', async () => {
    const onAdjustZones = vi.fn();
    const { user } = setup(
      [
        word('1', '控制', 'cntrler', { toCheck: { term: false, meaning: true } }),
        word('2', '政府', 'gvrnmt', { toCheck: { term: true, meaning: true } }),
      ],
      { onAdjustZones },
    );

    expect(screen.getByText(fr.photoWords.manyToCheck)).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.photoWords.adjustZones }));

    expect(onAdjustZones).toHaveBeenCalledOnce();
  });

  it('keeps the expert button discreet, without the message, when few cells are to check', () => {
    setup([word('1', '控制', 'contrôler')], { onAdjustZones: vi.fn() });

    expect(screen.queryByText(fr.photoWords.manyToCheck)).toBeNull();
    expect(screen.getByRole('button', { name: fr.photoWords.adjustZones })).toBeVisible();
  });
});
