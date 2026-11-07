<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import type { Card, Language } from '../../domain/card';
  import type { Mastery } from '../../domain/srs/mastery';
  import type { Label } from '../../domain/label';
  import {
    countWordsByLabel,
    deleteLabel,
    mergeLabels,
    renameLabel,
    type LabelChanges,
    type LabelOperationError,
  } from '../../domain/labelOperations';
  import type { Result } from '../../domain/result';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';
  import ConfirmAction from '../../ui/ConfirmAction.svelte';

  interface Props {
    labels: readonly Label[];
    cards: readonly Card[];
    clock: () => string;
    onChange: (changes: LabelChanges) => Promise<void>;
    /** Mastery gauge per language; the column is hidden without it. */
    masteryOf?: (label: Label) => Partial<Record<Language, Mastery>>;
  }

  const { labels, cards, clock, onChange, masteryOf }: Props = $props();

  const usages = $derived(countWordsByLabel(labels, cards));
  /** Typed new names and chosen merge targets, by label id. */
  const newNames = new SvelteMap<string, string>();
  const mergeTargets = new SvelteMap<string, string>();
  let status = $state<
    { kind: 'saved' } | { kind: 'refused'; reason: string } | { kind: 'failed' } | undefined
  >();

  const LANGUAGES: readonly Language[] = ['zh', 'en'];

  function gaugesOf(label: Label) {
    const mastery = masteryOf?.(label) ?? {};
    return LANGUAGES.flatMap((language) => {
      const gauge = mastery[language];
      return gauge === undefined
        ? []
        : [
            {
              language,
              ...gauge,
              text: format(fr.labelManager.mastery, {
                language: fr.languages[language],
                mastered: gauge.mastered,
                total: gauge.total,
              }),
            },
          ];
    });
  }

  const nameOf = (labelId: string) => labels.find(({ id }) => id === labelId)?.name ?? '';

  async function apply(result: Result<LabelChanges, LabelOperationError | 'sameLabel'>) {
    if (!result.ok) {
      status = { kind: 'refused', reason: fr.labelManager.errors[result.errors[0] ?? 'required'] };
      return;
    }
    try {
      await onChange(result.value);
      status = { kind: 'saved' };
    } catch {
      status = { kind: 'failed' };
    }
  }

  async function rename(label: Label) {
    const renamed = renameLabel(labels, label.id, newNames.get(label.id) ?? '', clock());
    await apply(
      renamed.ok ? { ok: true, value: { labels: renamed.value, cardsToUpdate: [] } } : renamed,
    );
    if (renamed.ok) {
      newNames.delete(label.id);
    }
  }

  async function merge(label: Label) {
    const targetId = mergeTargets.get(label.id) ?? '';
    await apply(mergeLabels(labels, cards, label.id, targetId, clock()));
    mergeTargets.delete(label.id);
  }

  async function remove(label: Label) {
    await apply(deleteLabel(labels, cards, label.id, clock()));
  }
</script>

<section aria-labelledby="label-manager-title">
  <h2 id="label-manager-title">{fr.labelManager.title}</h2>

  {#if status?.kind === 'saved'}
    <p role="status">{fr.labelManager.saved}</p>
  {:else if status?.kind === 'refused'}
    <p role="alert" class="error">{status.reason}</p>
  {:else if status?.kind === 'failed'}
    <p role="alert" class="error">{fr.labelManager.saveFailed}</p>
  {/if}

  {#if usages.length === 0}
    <p>{fr.labelManager.empty}</p>
  {:else}
    <div class="table-scroll">
      <table>
        <caption>{fr.labelManager.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{fr.labelManager.columnName}</th>
            <th scope="col">{fr.labelManager.columnCount}</th>
            {#if masteryOf !== undefined}
              <th scope="col">{fr.labelManager.columnMastery}</th>
            {/if}
            <th scope="col">{fr.labelManager.columnActions}</th>
          </tr>
        </thead>
        <tbody>
          {#each usages as { label, wordCount } (label.id)}
            <tr>
              <th scope="row">{label.name}</th>
              <td>{format(fr.labelManager.count, { count: wordCount })}</td>
              {#if masteryOf !== undefined}
                <td>
                  {#each gaugesOf(label) as gauge (gauge.language)}
                    <div class="gauge">
                      <span>{gauge.text}</span>
                      <meter
                        min="0"
                        max={gauge.total}
                        value={gauge.mastered}
                        aria-label={gauge.text}
                      ></meter>
                    </div>
                  {/each}
                </td>
              {/if}
              <td>
                <div class="actions">
                  <div class="action">
                    <input
                      type="text"
                      maxlength="200"
                      aria-label={format(fr.labelManager.renameInput, { name: label.name })}
                      value={newNames.get(label.id) ?? ''}
                      oninput={(event) => {
                        newNames.set(label.id, event.currentTarget.value);
                      }}
                    />
                    <button
                      type="button"
                      aria-label={format(fr.labelManager.renameLabel, { name: label.name })}
                      onclick={() => rename(label)}>{fr.labelManager.rename}</button
                    >
                  </div>
                  {#if usages.length > 1}
                    <div class="action">
                      <select
                        aria-label={format(fr.labelManager.mergeSelect, { name: label.name })}
                        value={mergeTargets.get(label.id) ?? ''}
                        onchange={(event) => {
                          mergeTargets.set(label.id, event.currentTarget.value);
                        }}
                      >
                        <option value="">{fr.labelManager.mergeNone}</option>
                        {#each usages as other (other.label.id)}
                          {#if other.label.id !== label.id}
                            <option value={other.label.id}>{other.label.name}</option>
                          {/if}
                        {/each}
                      </select>
                      <ConfirmAction
                        text={fr.labelManager.merge}
                        label={format(fr.labelManager.mergeLabel, { name: label.name })}
                        disabled={(mergeTargets.get(label.id) ?? '') === ''}
                        question={format(fr.labelManager.confirmMerge, {
                          source: label.name,
                          target: nameOf(mergeTargets.get(label.id) ?? ''),
                        })}
                        confirmText={fr.labelManager.confirmMergeButton}
                        onConfirm={() => merge(label)}
                      />
                    </div>
                  {/if}
                  <ConfirmAction
                    text={fr.labelManager.delete}
                    label={format(fr.labelManager.deleteLabel, { name: label.name })}
                    question={format(fr.labelManager.confirmDelete, {
                      name: label.name,
                      count: wordCount,
                    })}
                    confirmText={fr.labelManager.confirmDeleteButton}
                    onConfirm={() => remove(label)}
                  />
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .gauge {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 8rem;
    font-size: var(--text-xs);
    color: var(--muted);
  }

  .gauge + .gauge {
    margin-top: var(--space-2);
  }

  meter {
    width: 100%;
    height: 10px;
  }

  .actions,
  .action {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .action input,
  .action select {
    min-width: 9rem;
  }
</style>
