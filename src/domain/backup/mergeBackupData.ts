import { termKey, type Card } from '../card';
import { uniqueValues } from '../collections';
import type { Label } from '../label';
import { findLabelByName } from '../labelOperations';
import type {
  PathProgressRecord,
  ProgressRecord,
  ReviewStateRecord,
  SessionRecord,
  SettingsRecord,
  Stage,
} from '../progressRecords';
import type { BackupData } from './backupDocument';

const STAGE_ORDER: readonly Stage[] = ['seed', 'sprout', 'stem', 'bud', 'flower', 'lantern'];

/** Incoming identifier → identifier in the merged profile. */
type IdMap = ReadonlyMap<string, string>;

const remap = (ids: IdMap, id: string) => ids.get(id) ?? id;

function remapKeys<V>(record: Record<string, V>, ids: IdMap): Record<string, V> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [remap(ids, key), value]));
}

/**
 * Merges a restored backup into the current profile (DESIGN §9.1): words united by
 * (language, term), labels by name, the most recently reviewed learning state per word, the
 * maximum of xp, level, best streak and unlocks. The local side wins any other conflict, and an
 * incoming id already taken by something else gets a new id, followed by every reference.
 */
export function mergeBackupData(
  local: BackupData,
  incoming: BackupData,
  newId: () => string,
): BackupData {
  const { labels, labelIds } = mergeLabels(local.labels, incoming.labels, newId);
  const { cards, cardIds } = mergeCards(local.cards, incoming.cards, labelIds, newId);
  return {
    cards,
    labels,
    ignoredTerms: uniqueBy(
      [...local.ignoredTerms, ...incoming.ignoredTerms],
      ({ language, term }) => `${language}:${term}`,
    ),
    reviewStates: mergeReviewStates(local.reviewStates, incoming.reviewStates, cardIds),
    sessions: uniqueBy(
      [
        ...local.sessions,
        ...incoming.sessions.map((session) => remapSession(session, labelIds, cardIds)),
      ],
      ({ id }) => id,
    ),
    ...optional(
      'progress',
      mergeProgress(local.progress, remapProgress(incoming.progress, cardIds)),
    ),
    ...optional('settings', local.settings ?? remapSettings(incoming.settings, labelIds)),
    pathProgress: uniqueBy(
      [
        ...local.pathProgress,
        ...incoming.pathProgress.map((path) => remapPath(path, labelIds, cardIds)),
      ],
      ({ labelId, language }) => `${labelId}:${language}`,
    ),
  };
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/** Keeps the first item of each key, in order. */
function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const itemKey = key(item);
    if (seen.has(itemKey)) {
      return false;
    }
    seen.add(itemKey);
    return true;
  });
}

/** Keeps an incoming id when it is free, otherwise draws a new one. */
function idAllocator(taken: Iterable<string>, newId: () => string) {
  const used = new Set(taken);
  return (id: string) => {
    const allocated = used.has(id) ? newId() : id;
    used.add(allocated);
    return allocated;
  };
}

function mergeLabels(local: readonly Label[], incoming: readonly Label[], newId: () => string) {
  const labels = [...local];
  const labelIds = new Map<string, string>();
  const allocate = idAllocator(
    local.map(({ id }) => id),
    newId,
  );
  for (const label of incoming) {
    const sameName = findLabelByName(labels, label.name);
    if (sameName === undefined) {
      const id = allocate(label.id);
      labels.push({ ...label, id });
      labelIds.set(label.id, id);
    } else {
      labelIds.set(label.id, sameName.id);
    }
  }
  return { labels, labelIds };
}

function mergeCards(
  local: readonly Card[],
  incoming: readonly Card[],
  labelIds: IdMap,
  newId: () => string,
) {
  // A Map keeps the insertion order: local words first, then the new incoming ones.
  const byTerm = new Map(local.map((card) => [termKey(card.language, card.term), card]));
  const cardIds = new Map<string, string>();
  const allocate = idAllocator(
    local.map(({ id }) => id),
    newId,
  );
  for (const card of incoming) {
    const key = termKey(card.language, card.term);
    const cardLabelIds = card.labelIds.map((id) => remap(labelIds, id));
    const existing = byTerm.get(key);
    if (existing === undefined) {
      const id = allocate(card.id);
      byTerm.set(key, { ...card, id, labelIds: cardLabelIds });
      cardIds.set(card.id, id);
    } else {
      byTerm.set(key, {
        ...existing,
        labelIds: uniqueValues([...existing.labelIds, ...cardLabelIds]),
      });
      cardIds.set(card.id, existing.id);
    }
  }
  return { cards: [...byTerm.values()], cardIds };
}

const reviewTime = ({ lastReviewAt }: ReviewStateRecord) =>
  lastReviewAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(lastReviewAt);

const highestStage = (left: Stage, right: Stage) =>
  STAGE_ORDER.indexOf(left) >= STAGE_ORDER.indexOf(right) ? left : right;

function mergeReviewStates(
  local: readonly ReviewStateRecord[],
  incoming: readonly ReviewStateRecord[],
  cardIds: IdMap,
): ReviewStateRecord[] {
  const byCard = new Map(local.map((state) => [state.cardId, state]));
  for (const state of incoming) {
    const candidate = { ...state, cardId: remap(cardIds, state.cardId) };
    const existing = byCard.get(candidate.cardId);
    if (existing === undefined) {
      byCard.set(candidate.cardId, candidate);
    } else {
      const latest = reviewTime(candidate) > reviewTime(existing) ? candidate : existing;
      byCard.set(candidate.cardId, {
        ...latest,
        peakStage: highestStage(existing.peakStage, candidate.peakStage),
      });
    }
  }
  return [...byCard.values()];
}

function remapSession(session: SessionRecord, labelIds: IdMap, cardIds: IdMap): SessionRecord {
  return {
    ...session,
    ...optional(
      'labelIds',
      session.labelIds?.map((id) => remap(labelIds, id)),
    ),
    results: session.results.map((result) => ({
      ...result,
      cardId: remap(cardIds, result.cardId),
    })),
  };
}

function remapPath(path: PathProgressRecord, labelIds: IdMap, cardIds: IdMap): PathProgressRecord {
  const { stepAttempts, shuffledSentences } = path;
  return {
    ...path,
    labelId: remap(labelIds, path.labelId),
    ...optional('shuffledSentences', shuffledSentences && remapKeys(shuffledSentences, cardIds)),
    ...optional(
      'stepAttempts',
      stepAttempts &&
        Object.fromEntries(
          Object.entries(stepAttempts).map(([step, attempts]) => [
            step,
            remapKeys(attempts, cardIds),
          ]),
        ),
    ),
  };
}

function remapProgress(progress: ProgressRecord | undefined, cardIds: IdMap) {
  return (
    progress && {
      ...progress,
      ...optional(
        'dailyRewardedCount',
        progress.dailyRewardedCount && remapKeys(progress.dailyRewardedCount, cardIds),
      ),
    }
  );
}

function remapSettings(settings: SettingsRecord | undefined, labelIds: IdMap) {
  return (
    settings && {
      ...settings,
      ...optional(
        'intensiveExamMode',
        settings.intensiveExamMode && remapKeys(settings.intensiveExamMode, labelIds),
      ),
    }
  );
}

function highest(left: number | undefined, right: number | undefined): number | undefined {
  return left === undefined || right === undefined ? (left ?? right) : Math.max(left, right);
}

function mergeProgress(
  local: ProgressRecord | undefined,
  incoming: ProgressRecord | undefined,
): ProgressRecord | undefined {
  if (local === undefined || incoming === undefined) {
    return local ?? incoming;
  }
  const unlocks =
    local.unlocks === undefined && incoming.unlocks === undefined
      ? undefined
      : uniqueValues([...(local.unlocks ?? []), ...(incoming.unlocks ?? [])]);
  return {
    ...incoming,
    ...local,
    ...optional('xp', highest(local.xp, incoming.xp)),
    ...optional('level', highest(local.level, incoming.level)),
    ...optional('bestStreak', highest(local.bestStreak, incoming.bestStreak)),
    ...optional('unlocks', unlocks),
  };
}
