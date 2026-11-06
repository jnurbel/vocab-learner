<script lang="ts">
  import { detectLanguage } from '../../domain/bulkEntryParser';
  import type { Card } from '../../domain/card';
  import type { ImportChanges } from '../../domain/importPlan';
  import type { Label } from '../../domain/label';
  import { resolveLabelChoice } from '../../domain/labelOperations';
  import type { PinyinGenerator } from '../../domain/pinyinGeneration';
  import { failure, success, type Result } from '../../domain/result';
  import {
    editCard,
    planWordEntry,
    type WordEditError,
    type WordFields,
  } from '../../domain/wordEntry';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import LabelPicker from '../labels/LabelPicker.svelte';
  import { PinyinSource } from '../pinyinSource.svelte';
  import type { VocabularySave } from '../vocabularySave';

  interface Props {
    /** Makes the ids unique when the entry and the edit forms are both shown. */
    idPrefix: string;
    existingCards: readonly Card[];
    existingLabels: readonly Label[];
    loadPinyin: () => Promise<PinyinGenerator>;
    newId: () => string;
    clock: () => string;
    onSave: (save: VocabularySave) => Promise<void>;
    /** The word to edit; without it the form enters a new word. */
    card?: Card;
    /** Called once an edit is saved, or when it is cancelled. */
    onClose?: () => void;
  }

  const {
    idPrefix,
    existingCards,
    existingLabels,
    loadPinyin,
    newId,
    clock,
    onSave,
    card,
    onClose,
  }: Props = $props();

  /** What saving the form does: the changes to store (none if there is nothing new) and why. */
  interface Decision {
    changes: ImportChanges | undefined;
    message: string;
  }

  const pinyinSource = new PinyinSource(() => loadPinyin());
  const id = (field: string) => `${idPrefix}-${field}`;

  // The form starts from the word being edited; the parent recreates it for another word.
  // svelte-ignore state_referenced_locally
  const initial = card;
  let term = $state(initial?.term ?? '');
  /** What the learner typed in the pinyin field; undefined while the proposal is kept. */
  let typedPinyin = $state<string | undefined>(initial?.pinyin);
  let translation = $state(initial?.translation ?? '');
  let example = $state(initial?.example ?? '');
  let chosenLabelIds = $state<string[]>(initial === undefined ? [] : [...initial.labelIds]);
  let labelName = $state('');
  let errors = $state<WordEditError[]>([]);
  let status = $state<{ kind: 'done'; message: string } | { kind: 'failed' } | undefined>();
  let termInput = $state<HTMLInputElement>();

  const isChinese = $derived(detectLanguage(term) === 'zh');
  const proposedPinyin = $derived(
    isChinese && pinyinSource.generator !== undefined ? pinyinSource.generator(term.trim()) : '',
  );
  const pinyin = $derived(typedPinyin ?? proposedPinyin);
  const labelChoice = $derived(
    resolveLabelChoice(existingLabels, chosenLabelIds, labelName, { id: 'pending', now: '' }),
  );

  $effect(() => {
    if (isChinese && typedPinyin === undefined) {
      pinyinSource.request();
    }
  });

  function errorOf(field: WordEditError['field']): string | undefined {
    const reason = errors.find((error) => error.field === field)?.reason;
    return reason === undefined ? undefined : fr.wordForm.errors[reason];
  }

  /** The proposal may still be loading when the learner saves: wait for it. */
  async function pinyinToSave(): Promise<string> {
    if (typedPinyin !== undefined || !isChinese) {
      return pinyin;
    }
    return (await pinyinSource.ready())?.(term.trim()) ?? '';
  }

  function decide(fields: WordFields, now: string): Result<Decision, WordEditError> {
    if (card !== undefined) {
      const edited = editCard(card, fields, existingCards, now);
      return edited.ok
        ? success({
            changes: { cardsToCreate: [], cardsToUpdate: [edited.value] },
            message: format(fr.wordForm.updated, { term: edited.value.term }),
          })
        : failure(edited.errors);
    }
    const outcome = planWordEntry(fields, existingCards, { id: newId(), now });
    if (!outcome.ok) {
      return outcome;
    }
    const entered = outcome.value;
    const message = format(fr.wordForm[entered.kind], { term: entered.card.term });
    const changes: Record<typeof entered.kind, ImportChanges | undefined> = {
      created: { cardsToCreate: [entered.card], cardsToUpdate: [] },
      labelsAdded: { cardsToCreate: [], cardsToUpdate: [entered.card] },
      alreadyPresent: undefined,
    };
    return success({ changes: changes[entered.kind], message });
  }

  async function save() {
    const now = clock();
    const choice = resolveLabelChoice(existingLabels, chosenLabelIds, labelName, {
      id: newId(),
      now,
    });
    if (!choice.ok) {
      return;
    }
    const fields = {
      term,
      pinyin: await pinyinToSave(),
      translation,
      example,
      labelIds: choice.value.labelIds,
    };
    const decision = decide(fields, now);
    if (!decision.ok) {
      errors = decision.errors;
      return;
    }
    errors = [];
    const { changes, message } = decision.value;
    try {
      if (changes !== undefined) {
        await onSave({ newLabel: choice.value.newLabel, changes });
      }
    } catch {
      status = { kind: 'failed' };
      return;
    }
    status = { kind: 'done', message };
    if (card === undefined) {
      clearForNextWord();
    } else {
      onClose?.();
    }
  }

  /** Keeps the ticked labels: the next word often belongs to the same lesson. */
  function clearForNextWord() {
    term = '';
    typedPinyin = undefined;
    translation = '';
    example = '';
    labelName = '';
    termInput?.focus();
  }
</script>

<form
  aria-labelledby={id('title')}
  novalidate
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  <h2 id={id('title')}>
    {card === undefined ? fr.wordForm.title : format(fr.wordForm.editTitle, { term: card.term })}
  </h2>

  <label for={id('term')}>{fr.wordForm.term}</label>
  <input
    id={id('term')}
    type="text"
    lang={isChinese ? 'zh-CN' : undefined}
    maxlength="200"
    bind:value={term}
    bind:this={termInput}
    aria-invalid={errorOf('term') === undefined ? undefined : 'true'}
    aria-describedby={errorOf('term') === undefined ? undefined : id('term-error')}
  />
  {#if errorOf('term') !== undefined}
    <p id={id('term-error')} class="error">{errorOf('term')}</p>
  {/if}

  {#if isChinese}
    <label for={id('pinyin')}>{fr.wordForm.pinyin}</label>
    <input
      id={id('pinyin')}
      type="text"
      maxlength="600"
      value={pinyin}
      oninput={(event) => {
        typedPinyin = event.currentTarget.value;
      }}
      aria-invalid={errorOf('pinyin') === undefined ? undefined : 'true'}
      aria-describedby={id('pinyin-help')}
    />
    <p id={id('pinyin-help')} class={errorOf('pinyin') === undefined ? 'help' : 'error'}>
      {errorOf('pinyin') ?? fr.wordForm.pinyinHelp}
    </p>
  {/if}

  <label for={id('translation')}>{fr.wordForm.translation}</label>
  <input
    id={id('translation')}
    type="text"
    maxlength="600"
    bind:value={translation}
    aria-invalid={errorOf('translation') === undefined ? undefined : 'true'}
    aria-describedby={errorOf('translation') === undefined ? undefined : id('translation-error')}
  />
  {#if errorOf('translation') !== undefined}
    <p id={id('translation-error')} class="error">{errorOf('translation')}</p>
  {/if}

  <label for={id('example')}>{fr.wordForm.example}</label>
  <textarea
    id={id('example')}
    rows="2"
    maxlength="2000"
    bind:value={example}
    aria-invalid={errorOf('example') === undefined ? undefined : 'true'}
    aria-describedby={errorOf('example') === undefined ? undefined : id('example-error')}
  ></textarea>
  {#if errorOf('example') !== undefined}
    <p id={id('example-error')} class="error">{errorOf('example')}</p>
  {/if}

  <LabelPicker
    legend={fr.wordForm.labelsLegend}
    {idPrefix}
    labels={existingLabels}
    bind:chosenLabelIds
    bind:labelName
    error={labelChoice.ok ? undefined : labelChoice.errors[0]}
  />

  {#if status?.kind === 'done'}
    <p role="status">{status.message}</p>
  {:else if status?.kind === 'failed'}
    <p role="alert" class="error">{fr.wordForm.saveFailed}</p>
  {/if}

  <div class="actions">
    <button type="submit" disabled={!labelChoice.ok}>
      {card === undefined ? fr.wordForm.add : fr.wordForm.saveChanges}
    </button>
    {#if card !== undefined}
      <button type="button" onclick={() => onClose?.()}>{fr.wordForm.cancel}</button>
    {/if}
  </div>
</form>

<style>
  input[type='text'],
  textarea {
    display: block;
    width: 100%;
  }

  .help {
    font-size: 0.9rem;
  }

  .error {
    color: #b00020;
  }

  .actions {
    display: flex;
    gap: 1rem;
  }
</style>
