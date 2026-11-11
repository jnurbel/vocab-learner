<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Card } from '../../domain/card';
  import type { Label } from '../../domain/label';
  import type { SpellingResult } from '../../domain/photo/frenchSpelling';
  import type { Box } from '../../domain/photo/photoBlocks';
  import { cutIntoPieces, fillTable } from '../../domain/photo/photoTable';
  import { blocksToText } from '../../domain/photo/photoText';
  import { toPhotoWords, type PhotoWord } from '../../domain/photo/photoWords';
  import { inferGrid, type Grid } from '../../domain/photo/tableGrid';
  import type { PinyinGenerator } from '../../domain/pinyinGeneration';
  import type { IgnoredTerm } from '../../domain/progressRecords';
  import type { Result } from '../../domain/result';
  import fr from '../../i18n/fr.json';
  import type { PhotoAnalysis, PhotoReader } from '../../services/ocr/photoReader';
  import {
    RecognitionCancelled,
    type RecognitionOptions,
    type RecognitionProgress,
  } from '../../services/ocr/textRecognizer';
  import type { PhotoError } from '../../services/photo/preparePhoto';
  import type { VocabularySave } from '../vocabularySave';
  import PhotoWordsPreview from './PhotoWordsPreview.svelte';
  import TextImport from './TextImport.svelte';
  import ZoneEditor from './ZoneEditor.svelte';

  /** Shows a photo kept in memory only, through a temporary blob: URL. */
  interface PreviewUrls {
    create(image: Blob): string;
    revoke(url: string): void;
  }

  interface Props {
    existingCards: readonly Card[];
    existingLabels: readonly Label[];
    loadPinyin: () => Promise<PinyinGenerator>;
    loadIgnoredTerms: () => Promise<IgnoredTerm[]>;
    newId: () => string;
    clock: () => string;
    onSave: (save: VocabularySave) => Promise<void>;
    /** Starts the on-device reader; it keeps its models until this import is closed. */
    createReader: () => PhotoReader;
    /** Reduces the photo and redraws it without its metadata. */
    preparePhoto: (file: File) => Promise<Result<Blob, PhotoError>>;
    /** Cuts a band of the photo, for the thumbnail of a word. */
    cropPhoto: (photo: Blob, box: Box) => Promise<Blob>;
    /** Expert setting: the zones are shown before the words. */
    alwaysShowZones: boolean;
    previewUrls?: PreviewUrls;
  }

  const {
    createReader,
    preparePhoto,
    cropPhoto,
    alwaysShowZones,
    previewUrls = {
      create: (image) => URL.createObjectURL(image),
      revoke: (url) => {
        URL.revokeObjectURL(url);
      },
    },
    ...importProps
  }: Props = $props();

  type Mode = 'list' | 'text';
  const MODES: readonly Mode[] = ['list', 'text'];

  /** Where the import of a photo stands. */
  type Stage =
    | { kind: 'reading'; progress: RecognitionProgress; controller: AbortController }
    | { kind: 'zones'; analysis: PhotoAnalysis; grid: Grid; words?: PhotoWord[] }
    | { kind: 'words'; analysis: PhotoAnalysis; grid: Grid; words: PhotoWord[]; id: number }
    | { kind: 'text'; text: string; id: number }
    | { kind: 'cancelled' }
    | { kind: 'failed'; message: string };

  let mode = $state<Mode>('list');
  let photo = $state.raw<{ image: Blob; url: string }>();
  let photoError = $state<PhotoError>();
  let stage = $state.raw<Stage>();
  let readings = 0;
  let reader: PhotoReader | undefined;

  const busy = $derived(stage?.kind === 'reading');

  function forgetPhoto() {
    if (photo !== undefined) {
      previewUrls.revoke(photo.url);
    }
    photo = undefined;
  }

  onDestroy(() => {
    if (stage?.kind === 'reading') {
      stage.controller.abort();
    }
    reader?.dispose();
    forgetPhoto();
  });

  async function choose(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    forgetPhoto();
    stage = undefined;
    photoError = undefined;
    if (file === undefined) {
      return;
    }
    const prepared = await preparePhoto(file);
    if (prepared.ok) {
      photo = { image: prepared.value, url: previewUrls.create(prepared.value) };
    } else {
      photoError = prepared.errors[0];
    }
  }

  /** Runs a step of the reading with its progress, cancellable; settles the stage on failure. */
  async function withProgress<T>(
    work: (options: RecognitionOptions) => Promise<T>,
  ): Promise<T | undefined> {
    const controller = new AbortController();
    stage = { kind: 'reading', progress: { step: 'loading', progress: 0 }, controller };
    try {
      return await work({
        signal: controller.signal,
        onProgress: (progress) => {
          if (stage?.kind === 'reading') {
            stage = { ...stage, progress };
          }
        },
      });
    } catch (error) {
      stage =
        error instanceof RecognitionCancelled
          ? { kind: 'cancelled' }
          : { kind: 'failed', message: fr.photoImport.errors.failed };
      return undefined;
    }
  }

  async function read() {
    if (photo === undefined) {
      return;
    }
    const image = photo.image;
    const readMode = mode;
    reader ??= createReader();
    const photoReader = reader;
    const analysis = await withProgress((options) => photoReader.analyze(image, options));
    if (analysis === undefined) {
      return;
    }
    if (readMode === 'text') {
      const text = blocksToText(analysis.blocks);
      readings += 1;
      stage =
        text === ''
          ? { kind: 'failed', message: fr.photoImport.nothingRead }
          : { kind: 'text', text, id: readings };
      return;
    }
    const grid = inferGrid(analysis.blocks, analysis.size);
    if (alwaysShowZones) {
      stage = { kind: 'zones', analysis, grid };
    } else {
      await readWords(analysis, grid);
    }
  }

  /**
   * The words of the table cut by the grid: the pieces of blocks cut by a separator are read
   * again with the model of their column, then the French meanings are corrected.
   */
  async function readWords(analysis: PhotoAnalysis, grid: Grid) {
    if (photo === undefined || reader === undefined) {
      return;
    }
    const image = photo.image;
    const photoReader = reader;
    const pieces = cutIntoPieces(grid, analysis.blocks);
    const toRead = pieces.filter(({ reading }) => reading === undefined);
    const rows = await withProgress(async (options) => {
      const read = await photoReader.readRegions(
        image,
        toRead.map(({ box, script }) => ({ box, script })),
        options,
      );
      const readPieces = pieces.map((piece) => {
        const index = toRead.indexOf(piece);
        return index === -1 ? piece : { ...piece, reading: read[index] };
      });
      return fillTable(grid, readPieces);
    });
    if (rows === undefined) {
      return;
    }
    if (rows.length === 0) {
      stage = { kind: 'failed', message: fr.photoImport.nothingRead };
      return;
    }
    const meanings = await withProgress(async (options): Promise<SpellingResult[]> => {
      options.onProgress({ step: 'correcting', progress: 0 });
      try {
        return await photoReader.correctFrench(
          rows.map(({ meaning }) => meaning.text),
          options,
        );
      } catch (error) {
        if (error instanceof RecognitionCancelled) {
          throw error;
        }
        // Without the dictionary (offline before its first use), the meanings stay as read.
        return [];
      }
    });
    if (meanings === undefined) {
      return;
    }
    readings += 1;
    stage = {
      kind: 'words',
      analysis,
      grid,
      words: toPhotoWords(rows, meanings, undefined),
      id: readings,
    };
  }
</script>

<section aria-labelledby="photo-import-title">
  <h2 id="photo-import-title">{fr.photoImport.title}</h2>
  <p class="honesty">{fr.photoImport.honesty}</p>
  <p class="help">{fr.photoImport.privacy}</p>

  <label for="photo-import-file">{fr.photoImport.fileLabel}</label>
  <input
    id="photo-import-file"
    type="file"
    accept="image/*"
    capture="environment"
    disabled={busy}
    onchange={choose}
  />

  {#if photoError !== undefined}
    <p role="alert" class="error">{fr.photoImport.errors[photoError]}</p>
  {/if}

  {#if photo !== undefined}
    {#if stage?.kind !== 'zones'}
      <img class="preview" src={photo.url} alt={fr.photoImport.previewAlt} />
    {/if}

    <fieldset>
      <legend>{fr.photoImport.modeLegend}</legend>
      {#each MODES as candidate (candidate)}
        <label class="mode">
          <input
            type="radio"
            name="photo-import-mode"
            value={candidate}
            bind:group={mode}
            disabled={busy}
          />
          {fr.photoImport.modes[candidate]}
        </label>
      {/each}
    </fieldset>

    {#if stage?.kind === 'reading'}
      <div class="progress">
        <label for="photo-import-progress">{fr.photoImport.progressLabel}</label>
        <progress id="photo-import-progress" max="1" value={stage.progress.progress}></progress>
        <p aria-live="polite">{fr.photoImport.steps[stage.progress.step]}</p>
        <button
          type="button"
          onclick={() => {
            if (stage?.kind === 'reading') {
              stage.controller.abort();
            }
          }}>{fr.photoImport.cancel}</button
        >
      </div>
    {:else}
      <button type="button" class="primary" onclick={read}>{fr.photoImport.read}</button>
    {/if}
  {/if}

  {#if stage?.kind === 'cancelled'}
    <p role="status">{fr.photoImport.cancelled}</p>
  {:else if stage?.kind === 'failed'}
    <p role="alert" class="error">{stage.message}</p>
  {/if}
</section>

{#if stage?.kind === 'zones' && photo !== undefined}
  {@const zones = stage}
  <ZoneEditor
    grid={zones.grid}
    photoUrl={photo.url}
    onApply={(grid: Grid) => void readWords(zones.analysis, grid)}
    {...zones.words === undefined
      ? {}
      : {
          onBack: () => {
            readings += 1;
            stage = { ...zones, kind: 'words', words: zones.words ?? [], id: readings };
          },
        }}
  />
{:else if stage?.kind === 'words' && photo !== undefined}
  {@const read = stage}
  {#key read.id}
    <PhotoWordsPreview
      {...importProps}
      words={read.words}
      photo={photo.image}
      {cropPhoto}
      {previewUrls}
      onAdjustZones={() => {
        stage = { kind: 'zones', analysis: read.analysis, grid: read.grid, words: read.words };
      }}
    />
  {/key}
{:else if stage?.kind === 'text'}
  {#key stage.id}
    <TextImport
      {...importProps}
      initialText={stage.text}
      idPrefix="photo-text"
      title={fr.photoImport.textTitle}
      source="photo"
    />
  {/key}
{/if}

<style>
  label {
    display: block;
  }

  .honesty {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--info-soft);
    font-weight: var(--weight-bold);
  }

  .help {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .preview {
    display: block;
    max-width: 100%;
    max-height: 20rem;
    margin: var(--space-4) 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
  }

  fieldset {
    margin: var(--space-3) 0;
  }

  .mode {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .progress {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-3) 0;
  }

  progress {
    width: 100%;
    accent-color: var(--jade);
  }
</style>
