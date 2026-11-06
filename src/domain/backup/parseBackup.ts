import { failure, success, type Result } from '../result';
import {
  BACKUP_FORMAT,
  CURRENT_SCHEMA_VERSION,
  fingerprint,
  type BackupDocument,
} from './backupDocument';
import { BACKUP_LIMITS } from './backupSchema';
import type { Sha256 } from './sha256';

export interface BackupIssue {
  path: string;
  code: string;
  /** For `newerVersion`: the schema version the file needs. */
  version?: number;
}

type Outcome<T> = Result<T, BackupIssue>;

const fileIssue = (code: string) => failure([{ path: '', code }]);

/** Validates an untrusted backup file. Never throws. */
export async function parseBackup(text: string, sha256: Sha256): Promise<Outcome<BackupDocument>> {
  if (text.length > BACKUP_LIMITS.characters) {
    return fileIssue('fileTooLarge');
  }
  // Checked on the raw text: JSON.parse itself overflows the stack on a deeply nested input.
  if (nestingDepth(text) > BACKUP_LIMITS.depth) {
    return fileIssue('tooDeep');
  }
  const json = parseJson(text);
  if (!json.ok) {
    return json;
  }
  const envelope = readEnvelope(json.value);
  if (!envelope.ok) {
    return envelope;
  }
  const { schemaVersion, document } = envelope.value;
  // A newer app may fingerprint differently: the version is checked first.
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    return failure([{ path: 'schemaVersion', code: 'newerVersion', version: schemaVersion }]);
  }
  const { sha256: claimed, ...content } = document;
  if (claimed !== (await fingerprint(content, sha256))) {
    return failure([{ path: 'sha256', code: 'fingerprintMismatch' }]);
  }
  return success(document as unknown as BackupDocument);
}

interface Envelope {
  schemaVersion: number;
  document: Record<string, unknown>;
}

/** Just enough to know that the file is a backup, and of which version. */
function readEnvelope(value: unknown): Outcome<Envelope> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fileIssue('notABackup');
  }
  const document = value as Record<string, unknown>;
  const schemaVersion = document['schemaVersion'];
  if (
    document['format'] !== BACKUP_FORMAT ||
    typeof schemaVersion !== 'number' ||
    !Number.isInteger(schemaVersion)
  ) {
    return fileIssue('notABackup');
  }
  return success({ schemaVersion, document });
}

/** Deepest nesting of arrays and objects, brackets inside strings excluded; linear, no recursion. */
function nestingDepth(text: string): number {
  let depth = 0;
  let deepest = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (character === '\\') {
        index += 1;
      } else if (character === '"') {
        inString = false;
      }
    } else if (character === '"') {
      inString = true;
    } else if (character === '[' || character === '{') {
      depth += 1;
      deepest = Math.max(deepest, depth);
    } else if (character === ']' || character === '}') {
      depth -= 1;
    }
  }
  return deepest;
}

function parseJson(text: string): Outcome<unknown> {
  try {
    return success(JSON.parse(text) as unknown);
  } catch {
    return fileIssue('invalidJson');
  }
}
