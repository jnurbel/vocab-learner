import type { ImportChanges } from '../../domain/importPlan';
import type { Label } from '../../domain/label';

/** What the bulk entry screen asks to store once the user confirms the preview. */
export interface BulkEntrySave {
  /** Set when the typed label did not exist and must be stored with the words. */
  newLabel: Label | undefined;
  changes: ImportChanges;
}
