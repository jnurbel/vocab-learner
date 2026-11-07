import type { CreationContext } from './card';
import { success, type Result } from './result';
import { checkText, type TextFieldReason } from './text';

/** A free tag ("Leçon 7", "Animaux", "HSK 4"); it has no language and groups any words. */
export interface Label {
  id: string;
  name: string;
  color?: string;
  isFocus: boolean;
  /** Local day of the next test, 'YYYY-MM-DD'. */
  examDate?: string;
  /** The test date of a label unpinned automatically after its test, kept to undo it. */
  pastExamDate?: string;
  /** Local day the label was unpinned automatically: the undo is offered all that day. */
  unfocusedOn?: string;
  createdAt: string;
  updatedAt: string;
}

export const LABEL_NAME_MAX_LENGTH = 60;

export type LabelError = TextFieldReason;

export function checkLabelName(rawName: string): Result<string, LabelError> {
  return checkText(rawName, LABEL_NAME_MAX_LENGTH);
}

export function createLabel(rawName: string, context: CreationContext): Result<Label, LabelError> {
  const name = checkLabelName(rawName);
  if (!name.ok) {
    return name;
  }
  return success({
    id: context.id,
    name: name.value,
    isFocus: false,
    createdAt: context.now,
    updatedAt: context.now,
  });
}
