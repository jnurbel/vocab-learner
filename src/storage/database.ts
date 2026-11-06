import { Dexie, type EntityTable, type Table } from 'dexie';
import type { Card } from '../domain/card';
import type { Label } from '../domain/label';
import type {
  IgnoredTerm,
  PathProgressRecord,
  ProgressRecord,
  ReviewStateRecord,
  SessionRecord,
  SettingsRecord,
} from '../domain/progressRecords';

/** A card as stored: its identity key makes (language, term) unique at the database level. */
export interface StoredCard extends Card {
  termKey: string;
}

/** Key of the single row of the singleton tables (progress, settings). */
export const SINGLETON_KEY = 'current';

/** One database per profile (see DESIGN §3); the schema version drives migrations. */
export class VocabularyDatabase extends Dexie {
  cards!: EntityTable<StoredCard, 'id'>;
  labels!: EntityTable<Label, 'id'>;
  reviewStates!: EntityTable<ReviewStateRecord, 'cardId'>;
  sessions!: EntityTable<SessionRecord, 'id'>;
  /** Singleton: one row under SINGLETON_KEY. */
  progress!: Table<ProgressRecord, string>;
  /** Singleton: one row under SINGLETON_KEY. */
  settings!: Table<SettingsRecord, string>;
  ignoredTerms!: Table<IgnoredTerm, [string, string]>;
  pathProgress!: Table<PathProgressRecord, [string, string]>;
  /** Small key-value store of the app's own bookkeeping (backup dates, backup folder). */
  meta!: Table<unknown, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      // `*labelIds` is a multiEntry index: one entry per label of a card.
      cards: 'id, &termKey, language, *labelIds',
      labels: 'id',
    });
    // Version 2 (0.3.0) only adds tables: the words and labels of version 1 are kept as they are.
    this.version(2).stores({
      reviewStates: 'cardId, due',
      sessions: 'id, startedAt',
      // An empty primary key spec means out-of-line keys: rows are put under SINGLETON_KEY.
      progress: '',
      settings: '',
      ignoredTerms: '[language+term]',
      pathProgress: '[labelId+language]',
      meta: '',
    });
  }
}
