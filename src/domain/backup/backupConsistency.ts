import { termKey } from '../card';
import type { BackupData } from './backupDocument';
import type { BackupIssue } from './parseBackup';

/** Reports the second and later occurrences of a key. */
function duplicateFinder(code: string) {
  const seen = new Set<string>();
  return (key: string, path: string): BackupIssue[] => {
    if (seen.has(key)) {
      return [{ path, code }];
    }
    seen.add(key);
    return [];
  };
}

/**
 * Cross-references that a schema cannot express: unique identities, known words and labels.
 * Sessions are history: they may mention words or labels deleted since, so they are not checked.
 */
export function findInconsistencies(data: BackupData): BackupIssue[] {
  const labelIds = new Set(data.labels.map(({ id }) => id));
  const cardIds = new Set(data.cards.map(({ id }) => id));

  const duplicateLabel = duplicateFinder('duplicateLabel');
  const labelIssues = data.labels.flatMap((label, index) =>
    duplicateLabel(label.id, `data.labels.${String(index)}.id`),
  );

  const duplicateCard = duplicateFinder('duplicateCard');
  const duplicateWord = duplicateFinder('duplicateWord');
  const cardIssues = data.cards.flatMap((card, index) => {
    const path = `data.cards.${String(index)}`;
    return [
      ...duplicateCard(card.id, `${path}.id`),
      ...duplicateWord(termKey(card.language, card.term), `${path}.term`),
      ...card.labelIds.flatMap((labelId, labelIndex) =>
        labelIds.has(labelId)
          ? []
          : [{ path: `${path}.labelIds.${String(labelIndex)}`, code: 'unknownLabel' }],
      ),
    ];
  });

  const duplicateReviewState = duplicateFinder('duplicateReviewState');
  const reviewStateIssues = data.reviewStates.flatMap(({ cardId }, index) => {
    const path = `data.reviewStates.${String(index)}.cardId`;
    return cardIds.has(cardId)
      ? duplicateReviewState(cardId, path)
      : [{ path, code: 'unknownCard' }];
  });

  const duplicateIgnoredTerm = duplicateFinder('duplicateIgnoredTerm');
  const ignoredTermIssues = data.ignoredTerms.flatMap(({ language, term }, index) =>
    duplicateIgnoredTerm(`${language}:${term}`, `data.ignoredTerms.${String(index)}.term`),
  );

  const duplicateSession = duplicateFinder('duplicateSession');
  const sessionIssues = data.sessions.flatMap(({ id }, index) =>
    duplicateSession(id, `data.sessions.${String(index)}.id`),
  );

  const duplicatePath = duplicateFinder('duplicatePath');
  const pathIssues = data.pathProgress.flatMap(({ labelId, language }, index) => {
    const path = `data.pathProgress.${String(index)}.labelId`;
    return labelIds.has(labelId)
      ? duplicatePath(`${labelId}:${language}`, path)
      : [{ path, code: 'unknownLabel' }];
  });

  return [
    ...labelIssues,
    ...cardIssues,
    ...reviewStateIssues,
    ...ignoredTermIssues,
    ...sessionIssues,
    ...pathIssues,
  ];
}
