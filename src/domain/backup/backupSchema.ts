/** Bounds on an untrusted backup file, so that a hostile file cannot exhaust memory or storage. */
export const BACKUP_LIMITS = {
  /** 20 MB; a character takes at least one byte, so the file size is bounded too. */
  characters: 20 * 1024 * 1024,
  /** Real backups nest about 6 levels deep. */
  depth: 32,
} as const;
