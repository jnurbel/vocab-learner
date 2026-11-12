import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpellingResult } from '../../domain/photo/frenchSpelling';
import type { Box, DetectedBlock, Reading } from '../../domain/photo/photoBlocks';
import { failure, success, type Result } from '../../domain/result';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';
import type { PhotoError } from '../../services/photo/preparePhoto';
import type { PhotoAnalysis, PhotoReader, Region } from '../../services/ocr/photoReader';
import { RecognitionCancelled, type RecognitionOptions } from '../../services/ocr/textRecognizer';
import PhotoImport from './PhotoImport.svelte';

const now = '2026-11-11T12:00:00.000Z';
const prepared = new Blob(['redrawn pixels'], { type: 'image/jpeg' });

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
});

function block(x: number, y: number, text: string, width = 200): DetectedBlock {
  const han = /\p{Script=Han}/u.test(text);
  return {
    box: { x, y, width, height: 60 },
    chinese: { text, confidence: 0.99 },
    latin: { text: han ? '' : text, confidence: 0.95 },
  };
}

/** A notebook table: number | hanzi | pinyin | meaning; the second pinyin runs into its meaning. */
const TABLE: PhotoAnalysis = {
  size: { width: 1000, height: 400 },
  blocks: [
    block(20, 100, '1', 60),
    block(150, 100, '控制'),
    block(400, 100, 'kong zhi'),
    block(700, 100, 'controler'),
    block(20, 220, '2', 60),
    block(150, 220, '政府'),
    block(400, 220, 'zhen fu gouvernement', 520),
    block(20, 300, '3', 60),
    block(150, 300, '家庭'),
    block(400, 300, 'jia ting'),
    block(700, 300, 'famille'),
  ],
};

/** A reader that the test drives: it answers when told to, or at once with `table`. */
class FakeReader implements PhotoReader {
  readonly images: Blob[] = [];
  readonly regions: Region[][] = [];
  options: RecognitionOptions | undefined;
  disposed = false;
  analysis: PhotoAnalysis | 'wait' = TABLE;
  frenchFails = false;
  #answer: (analysis: PhotoAnalysis) => void = () => undefined;
  #fail: (error: Error) => void = () => undefined;

  analyze(image: Blob, options: RecognitionOptions): Promise<PhotoAnalysis> {
    this.images.push(image);
    this.options = options;
    if (this.analysis !== 'wait') {
      return Promise.resolve(this.analysis);
    }
    return new Promise((resolve, reject) => {
      this.#answer = resolve;
      this.#fail = reject;
      options.signal.addEventListener('abort', () => {
        reject(new RecognitionCancelled());
      });
    });
  }

  readRegions(_image: Blob, regions: readonly Region[]): Promise<Reading[]> {
    this.regions.push([...regions]);
    return Promise.resolve(
      regions.map(({ box }) => ({
        text: box.x < 650 ? 'zhen fu' : 'gouvernement',
        confidence: 0.9,
      })),
    );
  }

  correctFrench(texts: readonly string[]): Promise<SpellingResult[]> {
    if (this.frenchFails) {
      return Promise.reject(new Error('offline'));
    }
    return Promise.resolve(
      texts.map((text) => ({ text: text === 'controler' ? 'contrôler' : text, certain: true })),
    );
  }

  dispose() {
    this.disposed = true;
  }

  answer(analysis: PhotoAnalysis) {
    this.#answer(analysis);
  }

  fail(error: Error) {
    this.#fail(error);
  }
}

const PINYIN: Readonly<Record<string, string>> = {
  控制: 'kòngzhì',
  政府: 'zhèngfǔ',
  家庭: 'jiātíng',
};

function setup(options: { prepare?: Result<Blob, PhotoError>; alwaysShowZones?: boolean } = {}) {
  const reader = new FakeReader();
  const onSave = vi.fn(() => Promise.resolve());
  const previewUrls = { create: vi.fn(() => 'blob:preview-1'), revoke: vi.fn() };
  const preparePhoto = vi.fn(() => Promise.resolve(options.prepare ?? success(prepared)));
  const cropPhoto = vi.fn<(photo: Blob, box: Box) => Promise<Blob>>(() =>
    Promise.resolve(new Blob(['line'])),
  );
  const view = render(PhotoImport, {
    existingCards: [],
    existingLabels: [],
    loadPinyin: () => Promise.resolve((hanzi: string) => PINYIN[hanzi] ?? ''),
    loadIgnoredTerms: () => Promise.resolve([]),
    newId: () => 'id',
    clock: () => now,
    onSave,
    createReader: () => reader,
    preparePhoto,
    cropPhoto,
    previewUrls,
    alwaysShowZones: options.alwaysShowZones ?? false,
  });
  return { reader, onSave, previewUrls, preparePhoto, cropPhoto, view, user: userEvent.setup() };
}

const photoFile = () => new File(['original with EXIF'], 'lesson.jpg', { type: 'image/jpeg' });

async function choosePhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText(fr.photoImport.fileLabel), photoFile());
  await screen.findByRole('img', { name: fr.photoImport.previewAlt });
}

const termCell = (line: number) =>
  screen.getByRole('textbox', {
    name: format(fr.bulkEntry.cellLabel, { column: fr.bulkEntry.columns.term, line }),
  });
const meaningCell = (line: number) =>
  screen.getByRole('textbox', {
    name: format(fr.bulkEntry.cellLabel, { column: fr.bulkEntry.columns.translation, line }),
  });

describe('PhotoImport', () => {
  it('says honestly what it reads, and that the photo stays on the device', () => {
    setup();

    expect(screen.getByText(fr.photoImport.honesty)).toBeVisible();
    expect(screen.getByText(fr.photoImport.privacy)).toBeVisible();
  });

  it('asks for an image, from the files or the camera, as the phone lets the learner choose', () => {
    setup();

    const input = screen.getByLabelText(fr.photoImport.fileLabel);
    expect(input).toHaveAttribute('accept', 'image/*');
    // "capture" would open the camera straight away, without the photos already taken.
    expect(input).not.toHaveAttribute('capture');
  });

  it('shows the photo once reduced and redrawn, and reads that copy, not the original', async () => {
    const { user, reader, preparePhoto, previewUrls } = setup();

    await choosePhoto(user);

    expect(preparePhoto).toHaveBeenCalledWith(expect.objectContaining({ name: 'lesson.jpg' }));
    expect(previewUrls.create).toHaveBeenCalledWith(prepared);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    expect(reader.images).toEqual([prepared]);
  });

  it('reports a photo that cannot be used', async () => {
    const { user } = setup({ prepare: failure(['tooLarge']) });

    await user.upload(screen.getByLabelText(fr.photoImport.fileLabel), photoFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.photoImport.errors.tooLarge);
  });

  it('shows the progress of the reading, which can be cancelled', async () => {
    const { user, reader } = setup();
    reader.analysis = 'wait';

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    reader.options?.onProgress({ step: 'loading', progress: 0.4 });

    const progress = await screen.findByRole('progressbar', { name: fr.photoImport.progressLabel });
    await vi.waitFor(() => {
      expect(progress).toHaveAttribute('value', '0.4');
    });
    expect(screen.getByText(fr.photoImport.steps.loading)).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.photoImport.cancel }));

    expect(reader.options?.signal.aborted).toBe(true);
    expect(await screen.findByText(fr.photoImport.cancelled)).toBeVisible();
  });

  it('goes from the photo straight to the words, each read with the model of its column', async () => {
    const { user, reader, cropPhoto } = setup();

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));

    await screen.findByRole('region', { name: fr.photoImport.listTitle });
    expect(screen.queryByRole('region', { name: fr.photoZones.title })).toBeNull();
    expect(termCell(1)).toHaveValue('控制');
    expect(meaningCell(1)).toHaveValue('contrôler');
    expect(meaningCell(2)).toHaveValue('gouvernement');
    expect(reader.regions[0]).toEqual([
      expect.objectContaining({ script: 'latin' }),
      expect.objectContaining({ script: 'latin' }),
    ]);
    expect(cropPhoto).toHaveBeenCalledWith(prepared, expect.objectContaining({ x: 144, y: 94 }));
    await vi.waitFor(() => {
      expect(screen.getByText(format(fr.photoWords.notebook, { pinyin: 'zhen fu' }))).toBeVisible();
    });
  });

  it('saves the words checked, with the photo as their source', async () => {
    const { user, onSave } = setup();

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    const words = await screen.findByRole('region', { name: fr.photoImport.listTitle });
    await user.click(
      within(words).getByRole('button', { name: format(fr.bulkEntry.addWordsMany, { count: 3 }) }),
    );

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: {
          cardsToCreate: [
            expect.objectContaining({ term: '控制', source: 'photo' }),
            expect.objectContaining({ term: '政府', source: 'photo' }),
            expect.objectContaining({ term: '家庭', source: 'photo' }),
          ] as unknown,
          cardsToUpdate: [],
        },
      }),
    );
  });

  it('keeps the meanings as read, to check, when they cannot be corrected (offline)', async () => {
    const { user, reader } = setup();
    reader.frenchFails = true;

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));

    await screen.findByRole('region', { name: fr.photoImport.listTitle });
    expect(meaningCell(1)).toHaveValue('controler');
    expect(meaningCell(1)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the zones first when the learner asked for them, then the words in one tap', async () => {
    const { user } = setup({ alwaysShowZones: true });

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    await screen.findByRole('region', { name: fr.photoZones.title });
    expect(screen.queryByRole('region', { name: fr.photoImport.listTitle })).toBeNull();

    await user.click(screen.getByRole('button', { name: fr.photoZones.confirm }));

    await screen.findByRole('region', { name: fr.photoImport.listTitle });
    expect(termCell(3)).toHaveValue('家庭');
  });

  it('reads the words again after the learner moved a separator from the preview', async () => {
    const { user, reader } = setup();

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    await screen.findByRole('region', { name: fr.photoImport.listTitle });
    await user.click(screen.getByRole('button', { name: fr.photoWords.adjustZones }));

    await user.selectOptions(
      screen.getByRole('combobox', { name: format(fr.photoZones.columnRole, { index: 4 }) }),
      'ignore',
    );
    await user.click(screen.getByRole('button', { name: fr.photoZones.reread }));

    await screen.findByRole('region', { name: fr.photoImport.listTitle });
    expect(meaningCell(1)).toHaveValue('');
    expect(reader.regions).toHaveLength(2);
  });

  it('goes back to the words unchanged from the zones', async () => {
    const { user } = setup();

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    await screen.findByRole('region', { name: fr.photoImport.listTitle });
    await user.clear(termCell(1));
    await user.type(termCell(1), '控');
    await user.click(screen.getByRole('button', { name: fr.photoWords.adjustZones }));
    await user.click(screen.getByRole('button', { name: fr.photoZones.back }));

    expect(termCell(1)).toHaveValue('控制');
  });

  it('proposes the new words of a page of text read on the photo', async () => {
    const { user, reader } = setup();
    reader.analysis = {
      size: { width: 1000, height: 300 },
      blocks: [block(10, 10, 'The moon'), block(300, 12, 'is bright.')],
    };

    await choosePhoto(user);
    await user.click(screen.getByRole('radio', { name: fr.photoImport.modes.text }));
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));

    const text = await screen.findByRole('region', { name: fr.photoImport.textTitle });
    expect(within(text).getByRole('textbox', { name: fr.textImport.inputLabel })).toHaveValue(
      'The moon is bright.',
    );
  });

  it('says honestly when nothing could be read', async () => {
    const { user, reader } = setup();
    reader.analysis = { size: { width: 10, height: 10 }, blocks: [] };

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.photoImport.nothingRead);
  });

  it('says when the reader could not be loaded, e.g. offline before its first use', async () => {
    const { user, reader } = setup();
    reader.analysis = 'wait';

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    reader.fail(new Error('network'));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.photoImport.errors.failed);
  });

  it('frees the reader and the photo when closed', async () => {
    const { user, reader, previewUrls, view } = setup();

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    await screen.findByRole('region', { name: fr.photoImport.listTitle });
    view.unmount();

    expect(reader.disposed).toBe(true);
    expect(previewUrls.revoke).toHaveBeenCalledWith('blob:preview-1');
  });
});
