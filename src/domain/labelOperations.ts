import type { CreationContext } from './card';
import { checkLabelName, createLabel, type Label, type LabelError } from './label';
import { failure, success, type Result } from './result';

/** Two label names are the same when they differ only by case, spaces or Unicode form. */
function labelNameKey(name: string): string {
  return name.trim().normalize('NFC').toLowerCase();
}

function findLabelByName(labels: readonly Label[], name: string): Label | undefined {
  const key = labelNameKey(name);
  return labels.find((candidate) => labelNameKey(candidate.name) === key);
}

/** Labels are created on the fly while typing: an existing name is reused, never duplicated. */
export function findOrCreateLabel(
  labels: readonly Label[],
  rawName: string,
  context: CreationContext,
): Result<{ label: Label; created: boolean }, LabelError> {
  const candidate = createLabel(rawName, context);
  if (!candidate.ok) {
    return candidate;
  }
  const existing = findLabelByName(labels, candidate.value.name);
  return success(
    existing === undefined
      ? { label: candidate.value, created: true }
      : { label: existing, created: false },
  );
}

export type LabelOperationError = LabelError | 'nameTaken' | 'labelNotFound';

export function renameLabel(
  labels: readonly Label[],
  labelId: string,
  rawName: string,
  now: string,
): Result<Label[], LabelOperationError> {
  if (!labels.some((candidate) => candidate.id === labelId)) {
    return failure(['labelNotFound']);
  }
  const name = checkLabelName(rawName);
  if (!name.ok) {
    return name;
  }
  const homonym = findLabelByName(labels, name.value);
  if (homonym !== undefined && homonym.id !== labelId) {
    return failure(['nameTaken']);
  }
  return success(
    labels.map((candidate) =>
      candidate.id === labelId ? { ...candidate, name: name.value, updatedAt: now } : candidate,
    ),
  );
}
