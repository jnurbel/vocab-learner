import type { LocalDay } from '../domain/srs/localDay';
import type {
  ProgressRecord,
  ReviewStateRecord,
  SessionRecord,
  SessionResultRecord,
  SettingsRecord,
} from '../domain/progressRecords';
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
      const session = await sessions.get(sessionId);
      if (session === undefined) {
        throw new Error(`Unknown session: ${sessionId}`);
      }
      await sessions.put({ ...session, results: [...session.results, result] });
      await reviewStates.put(state);
      const current = await progress.get(SINGLETON_KEY);
      await progress.put({ ...current, lastActiveDate: activeDay }, SINGLETON_KEY);
    });
  }

  async endSession(sessionId: string, endedAt: string): Promise<void> {
    await this.db.sessions.update(sessionId, { endedAt });
  }

  async deleteDatabase(): Promise<void> {
    await this.db.delete();
  }
}
