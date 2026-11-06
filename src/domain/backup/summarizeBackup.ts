import type { Language } from '../card';
import type { BackupDocument } from './backupDocument';

/** What the restore preview shows: "312 mots, 9 labels, niveau 7, série 12 jours, le 05/11". */
export interface BackupSummary {
  profileName: string;
  /** ISO datetime of the backup. */
  exportedAt: string;
  appVersion: string;
  wordCount: number;
  wordsByLanguage: Record<Language, number>;
  labelCount: number;
  level?: number;
  streakDays?: number;
}

export function summarizeBackup(backup: BackupDocument): BackupSummary {
  const { cards, labels, progress } = backup.data;
  const wordsByLanguage: Record<Language, number> = { zh: 0, en: 0 };
  for (const { language } of cards) {
    wordsByLanguage[language] += 1;
  }
  return {
    profileName: backup.profileName,
    exportedAt: backup.exportedAt,
    appVersion: backup.appVersion,
    wordCount: cards.length,
    wordsByLanguage,
    labelCount: labels.length,
    ...(progress?.level === undefined ? {} : { level: progress.level }),
    ...(progress?.streakDays === undefined ? {} : { streakDays: progress.streakDays }),
  };
}
