import type { Language } from '../domain/card';
import type { Label } from '../domain/label';
import { dailyGoalOf } from '../domain/game/answerEvents';
import { applyEvent, type GameEvent } from '../domain/game/applyEvent';
import { ECONOMY_CONFIG, type EconomyConfig } from '../domain/game/economyConfig';
import { MINI_GAME_CONFIG, type MiniGameConfig } from '../domain/game/miniGameConfig';
import { PATH_CONFIG, type PathConfig } from '../domain/path/pathConfig';
import type { PathStepValidatedEvent } from '../domain/path/advancePath';
import {
  recordFinalChallenge,
  type FinalChallengeFinishedEvent,
} from '../domain/path/finalChallenge';
import { pathsAfterAnswer } from '../domain/path/pathsAfterAnswer';
import { applyPlacementTest, type PlacementScore } from '../domain/path/placementTest';
import { GAME_CONFIG } from '../domain/srs/config';
import { localDay, type LocalDay } from '../domain/srs/localDay';
import type {
  PathProgressRecord,
  ProgressRecord,
  ReviewStateRecord,
  SessionRecord,
  SessionResultRecord,
  SettingsRecord,
} from '../domain/progressRecords';
import { isSpeechRate } from '../domain/speechRate';
import { isAnswerMode, isValidNewPerDay, type AnswerMode } from '../domain/studySettings';
import { SINGLETON_KEY, toCard, VocabularyDatabase } from './database';

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

/** The rules the repository applies to the label paths it keeps up to date with every answer. */
export interface PathRules {
  path: PathConfig;
  economy: EconomyConfig;
  miniGames: Pick<MiniGameConfig, 'adaptive'>;
  /** Local hour at which a new day starts, for the points of a step reached in free practice. */
  dayStartHour: number;
}

export const DEFAULT_PATH_RULES: PathRules = Object.freeze({
  path: PATH_CONFIG,
  economy: ECONOMY_CONFIG,
  miniGames: MINI_GAME_CONFIG,
  dayStartHour: GAME_CONFIG.dayStartHour,
});

/** Stores the learning progress; the spaced repetition decides, the repository only stores. */
export class StudyRepository {
  private readonly db: VocabularyDatabase;

  constructor(
    databaseName: string,
    private readonly rules: PathRules = DEFAULT_PATH_RULES,
  ) {
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

  /** The path of a label in one language; absent until an answer or a test fed it. */
  async pathProgress(labelId: string, language: Language): Promise<PathProgressRecord | undefined> {
    return this.db.pathProgress.get([labelId, language]);
  }

  /** The answers of the sessions started since `since` (ISO datetime), in order. */
  async resultsSince(since: string): Promise<SessionResultRecord[]> {
    const sessions = await this.db.sessions
      .where('startedAt')
      .aboveOrEqual(since)
      .sortBy('startedAt');
    return sessions.flatMap(({ results }) => results);
  }

  /**
   * A placement test was scored (GAME_DESIGN.md 5.2): a passed one validates the current step,
   * with its points, in one write. Returns the steps validated; none after a failed test.
   */
  async applyPlacementTest(
    labelId: string,
    language: Language,
    score: PlacementScore,
    today: LocalDay,
  ): Promise<PathStepValidatedEvent[]> {
    if (!score.passed) {
      return [];
    }
    const { cards, reviewStates, pathProgress, progress, settings } = this.db;
    return this.db.transaction(
      'rw',
      [cards, reviewStates, pathProgress, progress, settings],
      async () => {
        const stored = (await pathProgress.get([labelId, language])) ?? { labelId, language };
        const labelCards = (await cards.where('labelIds').equals(labelId).toArray())
          .map(toCard)
          .filter((card) => card.language === language);
        const states = await reviewStates.bulkGet(labelCards.map(({ id }) => id));
        const advance = applyPlacementTest(
          {
            cards: labelCards,
            states: states.filter((state) => state !== undefined),
            progress: stored,
          },
          score,
          this.rules.path,
        );
        if (advance.events.length > 0) {
          await pathProgress.put(advance.progress);
          await this.applyGameEvents(advance.events, today);
        }
        return advance.events;
      },
    );
  }

  /**
   * The score of a final challenge (GAME_DESIGN.md 5.4): the best one is kept, and a first
   * success validates the last step with its points, in one write.
   */
  async recordFinalChallenge(
    labelId: string,
    language: Language,
    score20: number,
    today: LocalDay,
  ): Promise<FinalChallengeFinishedEvent> {
    const { pathProgress, progress, settings } = this.db;
    return this.db.transaction('rw', [pathProgress, progress, settings], async () => {
      const stored = (await pathProgress.get([labelId, language])) ?? { labelId, language };
      const recorded = recordFinalChallenge(stored, score20, this.rules.path);
      await pathProgress.put(recorded.progress);
      await this.applyGameEvents([recorded.event], today);
      return recorded.event;
    });
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
    await this.db.transaction('rw', this.answerTables(), async () => {
      await this.appendResult(sessionId, result);
      await this.updateProgress(progress);
      await this.advancePaths(result, dayOfResult(result, this.rules.dayStartHour));
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

  /** The speed of the voice, one of SPEECH_RATES; the other settings are kept. */
  async saveTtsRate(ttsRate: number): Promise<void> {
    if (!isSpeechRate(ttsRate)) {
      throw new RangeError(`Invalid speech rate: ${String(ttsRate)}`);
    }
    await this.updateSettings({ ttsRate });
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
    const { reviewStates, progress } = this.db;
    await this.db.transaction('rw', this.answerTables(), async () => {
      await (kind === 'append'
        ? this.appendResult(sessionId, result)
        : this.replaceLastResult(sessionId, result));
      await reviewStates.put(state);
      await this.updateProgress(update);
      const current = await progress.get(SINGLETON_KEY);
      await progress.put({ ...current, lastActiveDate: activeDay }, SINGLETON_KEY);
      await this.advancePaths(result, activeDay);
    });
  }

  /** Everything an answer writes: its result, state and points, and the label paths. */
  private answerTables() {
    const { reviewStates, sessions, progress, settings, cards, labels, pathProgress } = this.db;
    return [reviewStates, sessions, progress, settings, cards, labels, pathProgress];
  }

  /**
   * Every answer, whatever its exercise, feeds the paths of the pinned labels of its word
   * (GAME_DESIGN.md 5.1); a step validated gives its points with the answer. Runs inside the
   * transaction of the answer, after its review state is stored.
   */
  private async advancePaths(result: SessionResultRecord, today: LocalDay): Promise<void> {
    const word = await this.db.cards.get(result.cardId);
    if (word === undefined) {
      return;
    }
    const pinned = (await this.db.labels.bulkGet(word.labelIds)).filter(
      (label): label is Label => label?.isFocus === true,
    );
    if (pinned.length === 0) {
      return;
    }
    const labelIds = pinned.map(({ id }) => id);
    const cards = (await this.db.cards.where('labelIds').anyOf(labelIds).distinct().toArray()).map(
      toCard,
    );
    const states = await this.db.reviewStates.bulkGet(cards.map(({ id }) => id));
    const paths = await this.db.pathProgress.bulkGet(
      labelIds.map((labelId): [string, string] => [labelId, word.language]),
    );
    const update = pathsAfterAnswer(
      {
        answer: result,
        cards,
        labels: pinned,
        states: states.filter((state) => state !== undefined),
        paths: paths.filter((path) => path !== undefined),
      },
      this.rules.path,
    );
    await this.db.pathProgress.bulkPut(update.paths);
    await this.applyGameEvents(update.events, today);
  }

  /** Runs inside a transaction holding the progress and the settings. */
  private async applyGameEvents(events: readonly GameEvent[], today: LocalDay): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const { economy, miniGames } = this.rules;
    await this.updateProgress(({ progress, settings }) => {
      const context = { today, goal: dailyGoalOf(settings, economy), economy, miniGames };
      return events.reduce((sofar, event) => applyEvent(sofar, event, context).progress, progress);
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

/** The learner's day of a free practice answer, which carries no active day of its own. */
function dayOfResult(result: SessionResultRecord, dayStartHour: number): LocalDay {
  return localDay(result.at === undefined ? new Date() : new Date(result.at), dayStartHour);
}
