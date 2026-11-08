import { z } from 'zod';
import { CARD_LIMITS } from '../card';
import { LABEL_NAME_MAX_LENGTH } from '../label';
import { EXERCISE_TYPES } from '../progressRecords';
import { hexColor, identifier, safeText, singleLine } from '../safeText';
import { ANSWER_MODES } from '../studySettings';
import { BACKUP_FORMAT } from './backupDocument';

/** Bounds on an untrusted backup file, so that a hostile file cannot exhaust memory or storage. */
export const BACKUP_LIMITS = {
  /** 20 MB; a character takes at least one byte, so the file size is bounded too. */
  characters: 20 * 1024 * 1024,
  /** Real backups nest about 6 levels deep. */
  depth: 32,
  cards: 20_000,
  labels: 2_000,
  labelsPerCard: 50,
  ignoredTerms: 20_000,
  sessions: 20_000,
  resultsPerSession: 1_000,
  pathProgress: 4_000,
  /** Lists and maps inside progress and settings (unlocks, days, records...). */
  entries: 2_000,
  shortText: 200,
} as const;

const language = z.enum(['zh', 'en']);
const dateTime = z.iso.datetime({ offset: true });
/** A local day, 'YYYY-MM-DD'. */
const day = z.iso.date();
const count = z.number().int().nonnegative();
/** Names of games, modes and unlocks: plain tokens, possibly scoped (`listen:zh`). */
const token = z.string().regex(/^[A-Za-z0-9_:-]{1,64}$/);
const shortText = singleLine(BACKUP_LIMITS.shortText);

const boundedList = <T extends z.ZodType>(item: T) => z.array(item).max(BACKUP_LIMITS.entries);
const boundedRecord = <K extends z.ZodType<string>, V extends z.ZodType>(key: K, value: V) =>
  z
    .record(key, value)
    .refine((record) => Object.keys(record).length <= BACKUP_LIMITS.entries, 'Too many entries');

const cardSchema = z.strictObject({
  id: identifier,
  language,
  term: singleLine(CARD_LIMITS.term),
  pinyin: singleLine(CARD_LIMITS.pinyin).optional(),
  translation: singleLine(CARD_LIMITS.translation),
  example: safeText(CARD_LIMITS.example, { multiline: true }).optional(),
  labelIds: z.array(identifier).max(BACKUP_LIMITS.labelsPerCard),
  source: z.enum(['manual', 'csv', 'photo']),
  createdAt: dateTime,
  updatedAt: dateTime,
});

const labelSchema = z.strictObject({
  id: identifier,
  name: singleLine(LABEL_NAME_MAX_LENGTH),
  color: hexColor.optional(),
  isFocus: z.boolean(),
  examDate: day.optional(),
  pastExamDate: day.optional(),
  unfocusedOn: day.optional(),
  createdAt: dateTime,
  updatedAt: dateTime,
});

const ignoredTermSchema = z.strictObject({
  language,
  term: singleLine(CARD_LIMITS.term),
});

const stage = z.enum(['seed', 'sprout', 'stem', 'bud', 'flower', 'lantern']);

const reviewStateSchema = z.strictObject({
  cardId: identifier,
  due: dateTime,
  stability: z.number().nonnegative(),
  difficulty: z.number().nonnegative(),
  reps: count,
  lapses: count,
  state: z.enum(['new', 'review', 'relearning']),
  lastReviewAt: dateTime.optional(),
  successDays: count,
  lastSuccessDay: day.optional(),
  lastRatedDay: day.optional(),
  peakStage: stage,
});

const rating = z.enum(['again', 'hard', 'good', 'easy']);

const sessionResultSchema = z.strictObject({
  cardId: identifier,
  outcome: z.enum([...rating.options, 'correct', 'correctWithHint', 'almost', 'wrong']),
  exercise: z.enum(EXERCISE_TYPES).optional(),
  rating: rating.optional(),
  hintsUsed: count.optional(),
  responseMs: count.optional(),
  answer: singleLine(CARD_LIMITS.translation).optional(),
  at: dateTime.optional(),
});

const sessionSchema = z.strictObject({
  id: identifier,
  language,
  startedAt: dateTime,
  results: z.array(sessionResultSchema).max(BACKUP_LIMITS.resultsPerSession),
  labelIds: z.array(identifier).max(BACKUP_LIMITS.labelsPerCard).optional(),
  mode: token.optional(),
  endedAt: dateTime.optional(),
});

const progressSchema = z.strictObject({
  xp: count.optional(),
  level: count.optional(),
  streakDays: count.optional(),
  bestStreak: count.optional(),
  unlocks: boundedList(token).optional(),
  lastActiveDate: day.optional(),
  dailyXp: count.optional(),
  dailyXpDay: day.optional(),
  brumeDays: boundedList(day).optional(),
  gameLevels: boundedRecord(
    token,
    z.strictObject({
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      window: z.array(z.boolean()).max(100),
    }),
  ).optional(),
  rushRecords: boundedRecord(token, count).optional(),
  stamps: count.optional(),
  dailyRewardedCount: boundedRecord(identifier, count).optional(),
  dailyAnswers: count.optional(),
  lastStreakDay: day.optional(),
});

const settingsSchema = z.strictObject({
  voiceZh: shortText.optional(),
  voiceEn: shortText.optional(),
  ttsRate: z.number().min(0.1).max(10).optional(),
  dictationDelayMs: count.max(60_000).optional(),
  dailyGoalXp: count.max(100_000).optional(),
  photoCheckEnabled: z.boolean().optional(),
  speedGameEnabled: z.boolean().optional(),
  newPerDay: count.max(1_000).optional(),
  answerMode: z.enum(ANSWER_MODES).optional(),
  sfxEnabled: z.boolean().optional(),
  sfxVolume: z.number().min(0).max(1).optional(),
  audioFreeMode: z.boolean().optional(),
  rushTimeMultiplier: z.union([z.literal(1), z.literal(1.5), z.literal(2)]).optional(),
  intensiveExamMode: boundedRecord(identifier, z.boolean()).optional(),
});

const pathStep = z.enum([
  'discover',
  'listen',
  'recognize',
  'type',
  'dictation',
  'sentences',
  'finalChallenge',
]);

const pathProgressSchema = z.strictObject({
  labelId: identifier,
  language,
  steps: z
    .partialRecord(pathStep, z.enum(['locked', 'current', 'validated', 'skipped']))
    .optional(),
  stepAttempts: z.partialRecord(pathStep, boundedRecord(identifier, z.boolean())).optional(),
  // Out of 20, to the half point.
  finalChallengeBest: z.number().min(0).max(20).multipleOf(0.5).optional(),
  toneEchoRecent: boundedList(z.boolean()).optional(),
  shuffledSentences: boundedRecord(identifier, z.boolean()).optional(),
});

export const backupDataSchema = z.strictObject({
  cards: z.array(cardSchema).max(BACKUP_LIMITS.cards),
  labels: z.array(labelSchema).max(BACKUP_LIMITS.labels),
  ignoredTerms: z.array(ignoredTermSchema).max(BACKUP_LIMITS.ignoredTerms),
  reviewStates: z.array(reviewStateSchema).max(BACKUP_LIMITS.cards),
  sessions: z.array(sessionSchema).max(BACKUP_LIMITS.sessions),
  progress: progressSchema.optional(),
  settings: settingsSchema.optional(),
  pathProgress: z.array(pathProgressSchema).max(BACKUP_LIMITS.pathProgress),
});

/** The current layout of a backup file (schemaVersion is checked before, then migrated). */
export const backupDocumentSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().positive(),
  exportedAt: dateTime,
  // A SemVer such as 0.3.0 or 1.0.0-rc.1, as a plain token.
  appVersion: z.string().regex(/^\d[0-9A-Za-z.-]{0,39}$/),
  profileName: singleLine(LABEL_NAME_MAX_LENGTH),
  data: backupDataSchema,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
