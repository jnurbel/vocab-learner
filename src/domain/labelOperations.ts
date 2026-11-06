import type { Card, CreationContext } from './card';
import { uniqueValues } from './collections';
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

export interface LabelChoice {
  labelIds: string[];
  /** Set when the typed name was new: the label must be stored with the words. */
  newLabel: Label | undefined;
}

/** Labels chosen in an entry form: the ticked ones plus the typed name, if any. */
export function resolveLabelChoice(
  labels: readonly Label[],
  tickedLabelIds: readonly string[],
  typedName: string,
  context: CreationContext,
): Result<LabelChoice, LabelError> {
  if (typedName.trim() === '') {
    return success({ labelIds: uniqueValues(tickedLabelIds), newLabel: undefined });
  }
  const typed = findOrCreateLabel(labels, typedName, context);
  if (!typed.ok) {
    return typed;
  }
  const { label, created } = typed.value;
  return success({
    labelIds: uniqueValues([...tickedLabelIds, label.id]),
    newLabel: created ? label : undefined,
  });
}

export type LabelOperationError = LabelError | 'nameTaken' | 'labelNotFound';

export function renameLabel(
  labels: readonly Label[],
  labelId: string,
  rawName: string,
  now: string,
): Result<Label[], LabelOperationError> {
  if (!hasLabel(labels, labelId)) {
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

export interface LabelChanges {
  labels: Label[];
  cardsToUpdate: Card[];
}

/** Rewrites the labels of the words carrying `labelId`; the words themselves are never removed. */
function relabelCards(
  cards: readonly Card[],
  labelId: string,
  replacement: readonly string[],
  now: string,
): Card[] {
  return cards
    .filter((card) => card.labelIds.includes(labelId))
    .map((card) => ({
      ...card,
      labelIds: uniqueValues(card.labelIds.flatMap((id) => (id === labelId ? replacement : [id]))),
      updatedAt: now,
    }));
}

function hasLabel(labels: readonly Label[], labelId: string): boolean {
  return labels.some((candidate) => candidate.id === labelId);
}

/** Merges `sourceId` into `targetId`: every word keeps the union of its labels. */
export function mergeLabels(
  labels: readonly Label[],
  cards: readonly Card[],
  sourceId: string,
  targetId: string,
  now: string,
): Result<LabelChanges, LabelOperationError | 'sameLabel'> {
  if (sourceId === targetId) {
    return failure(['sameLabel']);
  }
  if (!hasLabel(labels, sourceId) || !hasLabel(labels, targetId)) {
    return failure(['labelNotFound']);
  }
  return success({
    labels: labels.filter((candidate) => candidate.id !== sourceId),
    cardsToUpdate: relabelCards(cards, sourceId, [targetId], now),
  });
}

/** Deletes a label; its words stay, possibly without any label ("Tous les mots"). */
export function deleteLabel(
  labels: readonly Label[],
  cards: readonly Card[],
  labelId: string,
  now: string,
): Result<LabelChanges, LabelOperationError> {
  if (!hasLabel(labels, labelId)) {
    return failure(['labelNotFound']);
  }
  return success({
    labels: labels.filter((candidate) => candidate.id !== labelId),
    cardsToUpdate: relabelCards(cards, labelId, [], now),
  });
}
