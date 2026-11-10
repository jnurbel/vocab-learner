<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Card } from '../../domain/card';
  import type { Label } from '../../domain/label';
  import type { PinyinGenerator } from '../../domain/pinyinGeneration';
  import type { IgnoredTerm } from '../../domain/progressRecords';
  import type { Result } from '../../domain/result';
  import fr from '../../i18n/fr.json';
  import type { PhotoError } from '../../services/photo/preparePhoto';
  import {
    RecognitionCancelled,
    type RecognitionProgress,
    type TextRecognizer,
  } from '../../services/ocr/textRecognizer';
  import type { VocabularySave } from '../vocabularySave';
  import BulkEntry from './BulkEntry.svelte';
  import TextImport from './TextImport.svelte';

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
    loadRecognizer: () => Promise<TextRecognizer>;
    /** Reduces the photo and redraws it without its metadata. */
    preparePhoto: (file: File) => Promise<Result<Blob, PhotoError>>;
    previewUrls?: PreviewUrls;
  }

  const {
    loadRecognizer,
    preparePhoto,
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

  type Reading =
    | { kind: 'reading'; progress: RecognitionProgress; controller: AbortController }
    | { kind: 'read'; text: string; mode: Mode; id: number }
    | { kind: 'cancelled' }
    | { kind: 'failed'; message: string };

  let mode = $state<Mode>('list');
  let photo = $state.raw<{ image: Blob; url: string }>();
  let photoError = $state<PhotoError>();
  let reading = $state.raw<Reading>();
  let readings = 0;

  function forgetPhoto() {
    if (photo !== undefined) {
      previewUrls.revoke(photo.url);
    }
    photo = undefined;
  }

  onDestroy(() => {
    if (reading?.kind === 'reading') {
      reading.controller.abort();
    }
    forgetPhoto();
  });

  async function choose(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    forgetPhoto();
    reading = undefined;
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

  async function read() {
    if (photo === undefined) {
      return;
    }
    const controller = new AbortController();
    const readMode = mode;
    reading = { kind: 'reading', progress: { step: 'loading', progress: 0 }, controller };
    try {
      const recognizer = await loadRecognizer();
      const text = await recognizer.recognize(photo.image, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (reading?.kind === 'reading') {
            reading = { ...reading, progress };
          }
        },
      });
      readings += 1;
      reading =
        text.trim() === ''
          ? { kind: 'failed', message: fr.photoImport.nothingRead }
          : { kind: 'read', text, mode: readMode, id: readings };
    } catch (error) {
      reading =
        error instanceof RecognitionCancelled
          ? { kind: 'cancelled' }
          : { kind: 'failed', message: fr.photoImport.errors.failed };
    }
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
    disabled={reading?.kind === 'reading'}
    onchange={choose}
  />

  {#if photoError !== undefined}
    <p role="alert" class="error">{fr.photoImport.errors[photoError]}</p>
  {/if}

  {#if photo !== undefined}
    <img class="preview" src={photo.url} alt={fr.photoImport.previewAlt} />

    <fieldset>
      <legend>{fr.photoImport.modeLegend}</legend>
      {#each MODES as candidate (candidate)}
        <label class="mode">
          <input
            type="radio"
            name="photo-import-mode"
            value={candidate}
            bind:group={mode}
            disabled={reading?.kind === 'reading'}
          />
          {fr.photoImport.modes[candidate]}
        </label>
      {/each}
    </fieldset>

    {#if reading?.kind === 'reading'}
      <div class="progress">
        <label for="photo-import-progress">{fr.photoImport.progressLabel}</label>
        <progress id="photo-import-progress" max="1" value={reading.progress.progress}></progress>
        <p aria-live="polite">{fr.photoImport.steps[reading.progress.step]}</p>
        <button
          type="button"
          onclick={() => {
            if (reading?.kind === 'reading') {
              reading.controller.abort();
            }
          }}>{fr.photoImport.cancel}</button
        >
      </div>
    {:else}
      <button type="button" class="primary" onclick={read}>{fr.photoImport.read}</button>
    {/if}
  {/if}

  {#if reading?.kind === 'cancelled'}
    <p role="status">{fr.photoImport.cancelled}</p>
  {:else if reading?.kind === 'failed'}
    <p role="alert" class="error">{reading.message}</p>
  {/if}
</section>

{#if reading?.kind === 'read'}
  {#key reading.id}
    {#if reading.mode === 'text'}
      <TextImport
        {...importProps}
        initialText={reading.text}
        idPrefix="photo-text"
        title={fr.photoImport.textTitle}
        source="photo"
      />
    {:else}
      <p class="help">{fr.photoImport.listHelp}</p>
      <BulkEntry
        {...importProps}
        initialText={reading.text}
        idPrefix="photo-list"
        title={fr.photoImport.listTitle}
        source="photo"
      />
    {/if}
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
