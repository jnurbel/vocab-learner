import { Dexie, type EntityTable } from 'dexie';
import type { Card } from '../domain/card';
import type { Label } from '../domain/label';

/** A card as stored: its identity key makes (language, term) unique at the database level. */
export interface StoredCard extends Card {
  termKey: string;
}

/** One database per profile (see DESIGN §3); the schema version drives migrations. */
export class VocabularyDatabase extends Dexie {
  cards!: EntityTable<StoredCard, 'id'>;
  labels!: EntityTable<Label, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      // `*labelIds` is a multiEntry index: one entry per label of a card.
      cards: 'id, &termKey, language, *labelIds',
      labels: 'id',
    });
  }
}
