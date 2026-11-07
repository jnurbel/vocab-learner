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

/** What a study session starts from. */
export interface StudyData {
  reviewStates: ReviewStateRecord[];
  /** Sessions started since the given date, to count what was already done today. */
  recentSessions: SessionRecord[];
  progress?: ProgressRecord;
  settings?: SettingsRecord;
}

export interface AnswerRecord {
  sessionId: string;
  /** Stored even when the answer left the memory model untouched (already rated today). */
  state: ReviewStateRecord;
  result: SessionResultRecord;
  /** The day of the session, which becomes the last active day. */
  activeDay: LocalDay;
}

/** A free practice answer: kept for the history, it changes no review state. */
export interface PracticeAnswerRecord {
  sessionId: string;
  result: SessionResultRecord;
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
  async recordAnswer({ sessionId, state, result, activeDay }: AnswerRecord): Promise<void> {
    const { reviewStates, sessions, progress } = this.db;
    await this.db.transaction('rw', [reviewStates, sessions, progress], async () => {
      await this.appendResult(sessionId, result);
      await reviewStates.put(state);
      const current = await progress.get(SINGLETON_KEY);
      await progress.put({ ...current, lastActiveDate: activeDay }, SINGLETON_KEY);
    });
  }

  /** Free practice never touches the review states nor the progress (DESIGN.md, 0.4.0). */
  async recordPracticeAnswer({ sessionId, result }: PracticeAnswerRecord): Promise<void> {
    await this.db.transaction('rw', this.db.sessions, () => this.appendResult(sessionId, result));
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

  private async appendResult(sessionId: string, result: SessionResultRecord): Promise<void> {
    const session = await this.db.sessions.get(sessionId);
    if (session === undefined) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    await this.db.sessions.put({ ...session, results: [...session.results, result] });
  }

  async deleteDatabase(): Promise<void> {
    await this.db.delete();
  }
}
