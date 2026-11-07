import type { LocalDay } from '../domain/srs/localDay';
import type {
  ProgressRecord,
  ReviewStateRecord,
  SessionRecord,
  SessionResultRecord,
  SettingsRecord,
} from '../domain/progressRecords';
import { isAnswerMode, isValidNewPerDay, type AnswerMode } from '../domain/studySettings';
import { SINGLETON_KEY, VocabularyDatabase } from './database';

/** Label ids used as object keys: plain tokens, as in backups. */
const LABEL_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** What a study session starts from. */
export interface StudyData {
  reviewStates: ReviewStateRecord[];
  /** Sessions started since the given date, to count what was already done today. */
  recentSessions: SessionRecord[];
  progress?: ProgressRecord;
  settings?: SettingsRecord;
}

/** What the game needs to update the progress: the stored progress and the settings. */
export interface StoredProgress {
  progress: ProgressRecord;
  settings: SettingsRecord | undefined;
}

/** A pure update of the progress, applied inside the write of the answer. */
export type ProgressUpdate = (stored: StoredProgress) => ProgressRecord;

export interface AnswerRecord {
  sessionId: string;
  /** Stored even when the answer left the memory model untouched (already rated today). */
  state: ReviewStateRecord;
  result: SessionResultRecord;
  /** The day of the session, which becomes the last active day. */
  activeDay: LocalDay;
  /** The game's points, level and streak, written together with the answer. */
  progress?: ProgressUpdate;
}

/** A free practice answer: kept for the history, it changes no review state. */
export interface PracticeAnswerRecord {
  sessionId: string;
  result: SessionResultRecord;
  /** Free practice earns points too; it never changes the last active day. */
  progress?: ProgressUpdate;
}

/** Stores the learning progress; the spaced repetition decides, the repository only stores. */
export class StudyRepository {
  private readonly db: VocabularyDatabase;

  constructor(databaseName: string) {
    this.db = new VocabularyDatabase(databaseName);
  }

  /** `since`: ISO datetime of the oldest session start to read. */
  async load(since: string): Promise<StudyData> {
    const { reviewStates, sessions, progress, settings } = this.db;
    return this.db.transaction('r', [reviewStates, sessions, progress, settings], async () => {
      const [states, recentSessions, progressRow, settingsRow] = await Promise.all([
        reviewStates.toArray(),
        sessions.where('startedAt').aboveOrEqual(since).toArray(),
        progress.get(SINGLETON_KEY),
        settings.get(SINGLETON_KEY),
      ]);
      return {
        reviewStates: states,
        recentSessions,
        ...(progressRow === undefined ? {} : { progress: progressRow }),
        ...(settingsRow === undefined ? {} : { settings: settingsRow }),
      };
    });
  }

  async reviewStates(): Promise<ReviewStateRecord[]> {
    return this.db.reviewStates.toArray();
  }

  async startSession(session: SessionRecord): Promise<void> {
    await this.db.sessions.add(session);
  }

  /** Each answer is kept at once, so that closing the tab loses nothing (GAME_DESIGN.md 1.4). */
  async recordAnswer(answer: AnswerRecord): Promise<void> {
    await this.storeAnswer(answer, 'append');
  }

  /** Free practice never touches the review states (DESIGN.md, 0.4.0); it may earn points. */
  async recordPracticeAnswer({ sessionId, result, progress }: PracticeAnswerRecord): Promise<void> {
    const { sessions, settings } = this.db;
    await this.db.transaction('rw', [sessions, this.db.progress, settings], async () => {
      await this.appendResult(sessionId, result);
      await this.updateProgress(progress);
    });
  }

  /** The game's progress alone, such as the points of a finished session. */
  async recordProgress(update: ProgressUpdate): Promise<void> {
    await this.db.transaction('rw', [this.db.progress, this.db.settings], () =>
      this.updateProgress(update),
    );
  }

  /**
   * Replaces the last answer of the word in its session, and its review state: "J'avais bon"
   * corrects an answer, it never adds a second one.
   */
  async reviseAnswer(answer: AnswerRecord): Promise<void> {
    await this.storeAnswer(answer, 'replaceLast');
  }

  /** Corrects a free practice answer; review states and progress stay untouched. */
  async revisePracticeAnswer({ sessionId, result }: PracticeAnswerRecord): Promise<void> {
    await this.db.transaction('rw', this.db.sessions, () =>
      this.replaceLastResult(sessionId, result),
    );
  }

  /** The daily quota of new words, from the next session on; the other settings are kept. */
  async saveNewPerDay(newPerDay: number): Promise<void> {
    if (!isValidNewPerDay(newPerDay)) {
      throw new RangeError(`Invalid daily quota of new words: ${String(newPerDay)}`);
    }
    await this.updateSettings({ newPerDay });
  }

  /** How the flashcards are answered, remembered for the next session; the rest is kept. */
  async saveAnswerMode(answerMode: AnswerMode): Promise<void> {
    if (!isAnswerMode(answerMode)) {
      throw new RangeError(`Invalid way of answering: ${String(answerMode)}`);
    }
    await this.updateSettings({ answerMode });
  }

  /**
   * The intensive mode chosen for the test of a label (GAME_DESIGN.md 2.5). The label id
   * becomes an object key: only plain identifiers are accepted, never `__proto__` and the like.
   */
  async saveIntensiveExamMode(labelId: string, intensive: boolean): Promise<void> {
    if (!LABEL_KEY.test(labelId) || FORBIDDEN_KEYS.has(labelId)) {
      throw new RangeError('Invalid label id for the intensive mode');
    }
    const { settings } = this.db;
    await this.db.transaction('rw', settings, async () => {
      const current = await settings.get(SINGLETON_KEY);
      const modes = new Map(Object.entries(current?.intensiveExamMode ?? {}));
      modes.set(labelId, intensive);
      await settings.put(
        { ...current, intensiveExamMode: Object.fromEntries(modes) },
        SINGLETON_KEY,
      );
    });
  }

  private async updateSettings(changes: Partial<SettingsRecord>): Promise<void> {
    const { settings } = this.db;
    await this.db.transaction('rw', settings, async () => {
      const current = await settings.get(SINGLETON_KEY);
      await settings.put({ ...current, ...changes }, SINGLETON_KEY);
    });
  }

  async endSession(sessionId: string, endedAt: string): Promise<void> {
    await this.db.sessions.update(sessionId, { endedAt });
  }

  /** The result, the review state and the active day are written together, or not at all. */
  private async storeAnswer(
    { sessionId, state, result, activeDay, progress: update }: AnswerRecord,
    kind: 'append' | 'replaceLast',
  ): Promise<void> {
    const { reviewStates, sessions, progress, settings } = this.db;
    await this.db.transaction('rw', [reviewStates, sessions, progress, settings], async () => {
      await (kind === 'append'
        ? this.appendResult(sessionId, result)
        : this.replaceLastResult(sessionId, result));
      await reviewStates.put(state);
      await this.updateProgress(update);
      const current = await progress.get(SINGLETON_KEY);
      await progress.put({ ...current, lastActiveDate: activeDay }, SINGLETON_KEY);
    });
  }

  /** Runs inside a transaction holding the progress and the settings. */
  private async updateProgress(update: ProgressUpdate | undefined): Promise<void> {
    if (update === undefined) {
      return;
    }
    const [stored, settings] = await Promise.all([
      this.db.progress.get(SINGLETON_KEY),
      this.db.settings.get(SINGLETON_KEY),
    ]);
    await this.db.progress.put(update({ progress: stored ?? {}, settings }), SINGLETON_KEY);
  }

  private async appendResult(sessionId: string, result: SessionResultRecord): Promise<void> {
    const session = await this.sessionOf(sessionId);
    await this.db.sessions.put({ ...session, results: [...session.results, result] });
  }

  private async replaceLastResult(sessionId: string, result: SessionResultRecord): Promise<void> {
    const session = await this.sessionOf(sessionId);
    const index = session.results.findLastIndex(({ cardId }) => cardId === result.cardId);
    if (index === -1) {
      throw new Error(`No answer to revise for ${result.cardId} in session ${sessionId}`);
    }
    await this.db.sessions.put({ ...session, results: session.results.with(index, result) });
  }

  private async sessionOf(sessionId: string): Promise<SessionRecord> {
    const session = await this.db.sessions.get(sessionId);
    if (session === undefined) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return session;
  }

  async deleteDatabase(): Promise<void> {
    await this.db.delete();
  }
}
