import { z } from 'zod';
import { CARD_LIMITS, termKey } from './card';
import { LABEL_NAME_MAX_LENGTH } from './label';
import { failure, success, type Result } from './result';

/** Bounds on an untrusted pack file, so that a hostile file cannot exhaust memory or storage. */
export const PACK_LIMITS = {
  characters: 2_000_000,
  cards: 5_000,
  labels: 500,
  labelsPerCard: 50,
} as const;

/** Control characters and bidi overrides or isolates ("trojan source"). */
const INVISIBLE_CONTROLS = /[\p{Cc}\p{Bidi_Control}]/u;
/** Tolerated in multiline texts only. */
const LINE_BREAKS = /[\t\n\r]/g;

const safeText = (maxLength: number, { multiline }: { multiline: boolean }) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine(
      (text) => !INVISIBLE_CONTROLS.test(multiline ? text.replace(LINE_BREAKS, '') : text),
      'Control characters are not allowed',
    );

const singleLine = (maxLength: number) => safeText(maxLength, { multiline: false });

/** Identifiers end up in IndexedDB keys and DOM attributes: short, plain tokens only. */
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const packLabelSchema = z.strictObject({
  id: identifier,
  name: singleLine(LABEL_NAME_MAX_LENGTH),
  // Used in a style directive: a strict hex code leaves no room for CSS injection.
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

const packCardSchema = z.strictObject({
  language: z.enum(['zh', 'en']),
  term: singleLine(CARD_LIMITS.term),
  pinyin: singleLine(CARD_LIMITS.pinyin).optional(),
  translation: singleLine(CARD_LIMITS.translation),
  example: safeText(CARD_LIMITS.example, { multiline: true }).optional(),
  labelIds: z.array(identifier).max(PACK_LIMITS.labelsPerCard),
});

const vocabPackSchema = z.strictObject({
  format: z.literal('vocab-learner-pack'),
  version: z.literal(1),
  labels: z.array(packLabelSchema).max(PACK_LIMITS.labels),
  cards: z.array(packCardSchema).max(PACK_LIMITS.cards),
});

/** A shareable list of words and labels, without any progress or personal data. */
export type VocabPack = z.infer<typeof vocabPackSchema>;

export interface PackIssue {
  path: string;
  code: string;
}

/** Validates an untrusted pack file. Never throws. */
export function parseVocabPack(text: string): Result<VocabPack, PackIssue> {
  if (text.length > PACK_LIMITS.characters) {
    return failure([{ path: '', code: 'fileTooLarge' }]);
  }
  const json = parseJson(text);
  if (!json.ok) {
    return json;
  }
  const parsed = vocabPackSchema.safeParse(json.value);
  if (!parsed.success) {
    return failure(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
    );
  }
  const inconsistencies = findInconsistencies(parsed.data);
  return inconsistencies.length > 0 ? failure(inconsistencies) : success(parsed.data);
}

function parseJson(text: string): Result<unknown, PackIssue> {
  try {
    return success(JSON.parse(text) as unknown);
  } catch {
    return failure([{ path: '', code: 'invalidJson' }]);
  }
}

/** Cross-references that a schema cannot express: unique ids, unique words, known labels. */
function findInconsistencies(pack: VocabPack): PackIssue[] {
  const issues: PackIssue[] = [];
  const labelIds = new Set<string>();
  pack.labels.forEach((label, index) => {
    if (labelIds.has(label.id)) {
      issues.push({ path: `labels.${String(index)}.id`, code: 'duplicateLabel' });
    }
    labelIds.add(label.id);
  });

  const wordKeys = new Set<string>();
  pack.cards.forEach((card, cardIndex) => {
    const key = termKey(card.language, card.term);
    if (wordKeys.has(key)) {
      issues.push({ path: `cards.${String(cardIndex)}.term`, code: 'duplicateWord' });
    }
    wordKeys.add(key);
    card.labelIds.forEach((labelId, labelIndex) => {
      if (!labelIds.has(labelId)) {
        const path = `cards.${String(cardIndex)}.labelIds.${String(labelIndex)}`;
        issues.push({ path, code: 'unknownLabel' });
      }
    });
  });
  return issues;
}
