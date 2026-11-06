import { termKey, type Card, type Language } from '../domain/card';
import type { ImportChanges } from '../domain/importPlan';
import type { Label } from '../domain/label';
import type { LabelChanges } from '../domain/labelOperations';
import { VocabularyDatabase, type StoredCard } from './database';

function toStored(card: Card): StoredCard {
  return { ...card, termKey: termKey(card.language, card.term) };
}

/** Drops the storage-only identity key. */
function toCard(stored: StoredCard): Card {
  const card: Card & { termKey?: string } = { ...stored };
  delete card.termKey;
  return card;
}

/** Persists words and labels; the domain decides, the repository only stores. */
export class VocabularyRepository {
  private readonly db: VocabularyDatabase;

  constructor(databaseName: string) {
    this.db = new VocabularyDatabase(databaseName);
  }

  /** Saves an import atomically, with the label created on the fly if any. */
  async saveImport(changes: ImportChanges, newLabel?: Label): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.labels, async () => {
      if (newLabel !== undefined) {
        await this.db.labels.add(newLabel);
      }
      await this.db.cards.bulkAdd(changes.cardsToCreate.map(toStored));
      await this.db.cards.bulkPut(changes.cardsToUpdate.map(toStored));
    });
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

  /** Deletes a word; its labels stay, even when no other word carries them. */
  async deleteCard(cardId: string): Promise<void> {
    await this.db.cards.delete(cardId);
  }

  async saveLabel(label: Label): Promise<void> {
    await this.db.labels.put(label);
  }

  async allLabels(): Promise<Label[]> {
    return this.db.labels.toArray();
  }

  /** Stores the outcome of a rename, merge or deletion atomically. */
  async applyLabelChanges(changes: LabelChanges): Promise<void> {
    await this.db.transaction('rw', this.db.labels, this.db.cards, async () => {
      const keptIds = new Set(changes.labels.map(({ id }) => id));
      const removedIds = (await this.db.labels.toCollection().primaryKeys()).filter(
        (id) => !keptIds.has(id),
      );
      await this.db.labels.bulkDelete(removedIds);
      await this.db.labels.bulkPut(changes.labels);
      await this.db.cards.bulkPut(changes.cardsToUpdate.map(toStored));
    });
  }

  async deleteDatabase(): Promise<void> {
    await this.db.delete();
  }
}
