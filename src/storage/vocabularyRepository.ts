import type { Card, Language } from '../domain/card';
import type { ImportChanges } from '../domain/importPlan';
import type { Label } from '../domain/label';
import type { LabelChanges } from '../domain/labelOperations';
import type { IgnoredTerm } from '../domain/progressRecords';
import { mergePaths } from '../domain/path/mergePaths';
import { toCard, toStored, VocabularyDatabase } from './database';

/** Persists words and labels; the domain decides, the repository only stores. */
export class VocabularyRepository {
  private readonly db: VocabularyDatabase;

  constructor(databaseName: string) {
    this.db = new VocabularyDatabase(databaseName);
  }

  /**
   * Saves an import atomically, with the label created on the fly if any, and the words the
   * learner marked "I already know it", never proposed again by the text import.
   */
  async saveImport(
    changes: ImportChanges,
    newLabel?: Label,
    ignoredTerms: readonly IgnoredTerm[] = [],
  ): Promise<void> {
    const { cards, labels } = this.db;
    await this.db.transaction('rw', cards, labels, this.db.ignoredTerms, async () => {
      if (newLabel !== undefined) {
        await this.db.labels.add(newLabel);
      }
      await this.db.cards.bulkAdd(changes.cardsToCreate.map(toStored));
      await this.db.cards.bulkPut(changes.cardsToUpdate.map(toStored));
      await this.db.ignoredTerms.bulkPut([...ignoredTerms]);
    });
  }

  async allIgnoredTerms(): Promise<IgnoredTerm[]> {
    return this.db.ignoredTerms.toArray();
  }

  async allCards(): Promise<Card[]> {
    return (await this.db.cards.toArray()).map(toCard);
  }

  /** Words carrying any of the labels, each word once, optionally in one language. */
  async cardsWithLabels(labelIds: readonly string[], language?: Language): Promise<Card[]> {
    const stored = await this.db.cards
      .where('labelIds')
      .anyOf([...labelIds])
      .distinct()
      .filter((card) => language === undefined || card.language === language)
      .toArray();
    return stored.map(toCard);
  }

  /**
   * Deletes a word with its learning progress, atomically; its labels stay, even when no other
   * word carries them.
   */
  async deleteCard(cardId: string): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.reviewStates, async () => {
      await this.db.cards.delete(cardId);
      await this.db.reviewStates.delete(cardId);
    });
  }

  async saveLabel(label: Label): Promise<void> {
    await this.db.labels.put(label);
  }

  /** Stores labels changed together (pinned, unpinned after a test) in one go; others stay. */
  async saveLabels(labels: readonly Label[]): Promise<void> {
    await this.db.labels.bulkPut([...labels]);
  }

  async allLabels(): Promise<Label[]> {
    return this.db.labels.toArray();
  }

  /**
   * Stores the outcome of a rename, merge or deletion atomically. A merged label hands its path
   * over to the label kept (validated steps, best score); a deleted label loses its path.
   */
  async applyLabelChanges(changes: LabelChanges): Promise<void> {
    const { labels, cards, pathProgress } = this.db;
    await this.db.transaction('rw', labels, cards, pathProgress, async () => {
      const keptIds = new Set(changes.labels.map(({ id }) => id));
      const removedIds = (await this.db.labels.toCollection().primaryKeys()).filter(
        (id) => !keptIds.has(id),
      );
      await this.db.labels.bulkDelete(removedIds);
      if (changes.merged !== undefined) {
        await this.carryPathsOver(changes.merged.sourceId, changes.merged.targetId);
      }
      await this.db.pathProgress.where('labelId').anyOf(removedIds).delete();
      await this.db.labels.bulkPut(changes.labels);
      await this.db.cards.bulkPut(changes.cardsToUpdate.map(toStored));
    });
  }

  /** Runs inside the transaction of a merge. */
  private async carryPathsOver(sourceId: string, targetId: string): Promise<void> {
    const absorbed = await this.db.pathProgress.where('labelId').equals(sourceId).toArray();
    for (const path of absorbed) {
      const kept = (await this.db.pathProgress.get([targetId, path.language])) ?? {
        labelId: targetId,
        language: path.language,
      };
      await this.db.pathProgress.put(mergePaths(path, kept));
    }
  }

  async deleteDatabase(): Promise<void> {
    await this.db.delete();
  }
}
