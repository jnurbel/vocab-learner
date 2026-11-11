import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { failure, success, type Result } from '../../domain/result';
import fr from '../../i18n/fr.json';
import type { PhotoError } from '../../services/photo/preparePhoto';
import {
  RecognitionCancelled,
  type RecognitionOptions,
  type TextRecognizer,
} from '../../services/ocr/textRecognizer';
import PhotoImport from './PhotoImport.svelte';

const now = '2026-11-10T12:00:00.000Z';
const prepared = new Blob(['redrawn pixels'], { type: 'image/jpeg' });

/** A recognizer that the test drives: it answers when told to. */
class FakeRecognizer implements TextRecognizer {
  readonly images: Blob[] = [];
  options: RecognitionOptions | undefined;
  #answer: (text: string) => void = () => undefined;
  #fail: (error: Error) => void = () => undefined;

  recognize(image: Blob, options: RecognitionOptions): Promise<string> {
    this.images.push(image);
    this.options = options;
    return new Promise((resolve, reject) => {
      this.#answer = resolve;
      this.#fail = reject;
      options.signal.addEventListener('abort', () => {
        reject(new RecognitionCancelled());
      });
    });
  }

  answer(text: string) {
    this.#answer(text);
  }

  fail(error: Error) {
    this.#fail(error);
  }
}

function setup(options: { prepare?: Result<Blob, PhotoError> } = {}) {
  const recognizer = new FakeRecognizer();
  const onSave = vi.fn(() => Promise.resolve());
  const previewUrls = { create: vi.fn(() => 'blob:preview-1'), revoke: vi.fn() };
  const preparePhoto = vi.fn(() => Promise.resolve(options.prepare ?? success(prepared)));
  render(PhotoImport, {
    existingCards: [],
    existingLabels: [],
    loadPinyin: () => Promise.resolve((hanzi: string) => `auto(${hanzi})`),
    loadIgnoredTerms: () => Promise.resolve([]),
    newId: () => 'id',
    clock: () => now,
    onSave,
    loadRecognizer: () => Promise.resolve(recognizer),
    preparePhoto,
    previewUrls,
  });
  return { recognizer, onSave, previewUrls, preparePhoto, user: userEvent.setup() };
}

const photoFile = () => new File(['original with EXIF'], 'lesson.jpg', { type: 'image/jpeg' });

async function choosePhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText(fr.photoImport.fileLabel), photoFile());
  await screen.findByRole('img', { name: fr.photoImport.previewAlt });
}

describe('PhotoImport', () => {
  it('says honestly what it reads well, and that the photo stays on the device', () => {
    setup();

    expect(screen.getByText(fr.photoImport.honesty)).toBeVisible();
    expect(screen.getByText(fr.photoImport.privacy)).toBeVisible();
  });

  it('asks for an image, from the camera on a phone', () => {
    setup();

    const input = screen.getByLabelText(fr.photoImport.fileLabel);
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('capture', 'environment');
  });

  it('shows the photo once reduced and redrawn, and reads that copy, not the original', async () => {
    const { user, recognizer, preparePhoto, previewUrls } = setup();

    await choosePhoto(user);

    expect(preparePhoto).toHaveBeenCalledWith(expect.objectContaining({ name: 'lesson.jpg' }));
    expect(previewUrls.create).toHaveBeenCalledWith(prepared);
    expect(screen.getByRole('img', { name: fr.photoImport.previewAlt })).toHaveAttribute(
      'src',
      'blob:preview-1',
    );
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    expect(recognizer.images).toEqual([prepared]);
  });

  it('shows the progress of the reading, which can be cancelled', async () => {
    const { user, recognizer } = setup();

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    recognizer.options?.onProgress({ step: 'reading', progress: 0.4 });

    const progress = await screen.findByRole('progressbar', { name: fr.photoImport.progressLabel });
    await vi.waitFor(() => {
      expect(progress).toHaveAttribute('value', '0.4');
    });
    expect(screen.getByText(fr.photoImport.steps.reading)).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.photoImport.cancel }));

    expect(recognizer.options?.signal.aborted).toBe(true);
    expect(await screen.findByRole('status')).toHaveTextContent(fr.photoImport.cancelled);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('proposes the new words of a text read on the photo, saved with the photo as source', async () => {
    const { user, recognizer, onSave } = setup();

    await choosePhoto(user);
    await user.click(screen.getByRole('radio', { name: fr.photoImport.modes.text }));
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    recognizer.answer('The moon is bright.');

    const text = await screen.findByRole('region', { name: fr.photoImport.textTitle });
    await user.type(within(text).getByLabelText('Sens de moon'), 'lune');
    await user.click(within(text).getByRole('button', { name: fr.textImport.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: {
          cardsToCreate: [expect.objectContaining({ term: 'moon', source: 'photo' })],
          cardsToUpdate: [],
        },
      }),
    );
  });

  it('puts a vocabulary list read on the photo into an editable bulk entry', async () => {
    const { user, recognizer } = setup();

    await choosePhoto(user);
    expect(screen.getByRole('radio', { name: fr.photoImport.modes.list })).toBeChecked();
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    recognizer.answer('你好 | nǐ hǎo | bonjour');

    const list = await screen.findByRole('region', { name: fr.photoImport.listTitle });
    expect(within(list).getByLabelText(fr.bulkEntry.inputLabel)).toHaveValue(
      '你好 | nǐ hǎo | bonjour',
    );
    expect(screen.getByText(fr.photoImport.listHelp)).toBeVisible();
  });

  it('says when no text could be read', async () => {
    const { user, recognizer } = setup();

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    recognizer.answer('');

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.photoImport.nothingRead);
  });

  it('reports a reading that fails, e.g. offline before the reader was ever loaded', async () => {
    const { user, recognizer } = setup();

    await choosePhoto(user);
    await user.click(screen.getByRole('button', { name: fr.photoImport.read }));
    recognizer.fail(new Error('network'));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.photoImport.errors.failed);
    expect(screen.getByRole('button', { name: fr.photoImport.read })).toBeEnabled();
  });

  it('refuses a file that is not an image', async () => {
    const { user } = setup({ prepare: failure(['notAnImage']) });

    await user.upload(screen.getByLabelText(fr.photoImport.fileLabel), photoFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.photoImport.errors.notAnImage);
    expect(screen.queryByRole('button', { name: fr.photoImport.read })).toBeNull();
  });

  it('forgets the previous photo when another one is chosen', async () => {
    const { user, previewUrls } = setup();

    await choosePhoto(user);
    await choosePhoto(user);

    expect(previewUrls.revoke).toHaveBeenCalledWith('blob:preview-1');
  });
});
