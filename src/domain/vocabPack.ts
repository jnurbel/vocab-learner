import { z } from 'zod';
import { CARD_LIMITS } from './card';
import { LABEL_NAME_MAX_LENGTH } from './label';
import { failure, success, type Result } from './result';

const requiredText = (maxLength: number) => z.string().trim().min(1).max(maxLength);

const packLabelSchema = z.strictObject({
  id: z.string(),
  name: requiredText(LABEL_NAME_MAX_LENGTH),
  color: z.string().optional(),
});

const packCardSchema = z.strictObject({
  language: z.enum(['zh', 'en']),
  term: requiredText(CARD_LIMITS.term),
  pinyin: requiredText(CARD_LIMITS.pinyin).optional(),
  translation: requiredText(CARD_LIMITS.translation),
  example: requiredText(CARD_LIMITS.example).optional(),
  labelIds: z.array(z.string()),
});

const vocabPackSchema = z.strictObject({
  format: z.literal('vocab-learner-pack'),
  version: z.literal(1),
  labels: z.array(packLabelSchema),
  cards: z.array(packCardSchema),
});

/** A shareable list of words and labels, without any progress or personal data. */
export type VocabPack = z.infer<typeof vocabPackSchema>;

export interface PackIssue {
  path: string;
  code: string;
}

/** Validates an untrusted pack file. Never throws. */
export function parseVocabPack(text: string): Result<VocabPack, PackIssue> {
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
  return success(parsed.data);
}

function parseJson(text: string): Result<unknown, PackIssue> {
  try {
    return success(JSON.parse(text) as unknown);
  } catch {
    return failure([{ path: '', code: 'invalidJson' }]);
  }
}
