import { describe, expect, it } from 'vitest';
import {
  createBackup,
  serializeBackup,
  type BackupData,
  type BackupDocument,
} from './backupDocument';
import {
  card,
  emptyData,
  label,
  metadata,
  now,
  reviewState,
  sampleData,
  sha256,
} from './backup.fixtures';
import { BACKUP_LIMITS } from './backupSchema';
import { canonicalJson } from './canonicalJson';
import { parseBackup } from './parseBackup';

async function backupText(edit: (document: Record<string, unknown>) => void = () => undefined) {
  const document = (await createBackup(sampleData(), metadata, sha256)) as unknown as Record<
    string,
    unknown
  >;
  edit(document);
  return JSON.stringify(document);
}

/** Re-fingerprints an edited document, as a hostile but careful author would. */
async function resealed(edit: (document: Record<string, unknown>) => void) {
  const backup = (await createBackup(sampleData(), metadata, sha256)) as unknown as Record<
    string,
    unknown
  >;
  edit(backup);
  delete backup['sha256'];
  backup['sha256'] = await sha256(canonicalJson(backup));
  return JSON.stringify(backup);
}

const codes = (result: { ok: boolean; errors?: { code: string }[] }) =>
  result.ok ? [] : (result.errors ?? []).map(({ code }) => code);

describe('parseBackup', () => {
  it('reads back exactly the backup the app wrote', async () => {
    const backup = await createBackup(sampleData(), metadata, sha256);

    const parsed = await parseBackup(serializeBackup(backup), sha256);

    expect(parsed).toEqual({ ok: true, value: backup });
  });

  it('keeps a pinned label with its test date, and an unpinned one with its past test', async () => {
    const backupData = sampleData();
    backupData.labels = [
      ...backupData.labels,
      { ...label('lesson', 'Leçon 7'), isFocus: true, examDate: '2026-11-13' },
      { ...label('old', 'Leçon 6'), pastExamDate: '2026-11-06', unfocusedOn: '2026-11-07' },
    ];
    const backup = await createBackup(backupData, metadata, sha256);

    const parsed = await parseBackup(serializeBackup(backup), sha256);

    expect(parsed).toEqual({ ok: true, value: backup });
  });

  it.each([
    ['not JSON at all', 'hello'],
    ['an empty file', ''],
  ])('rejects %s as invalid JSON, without throwing', async (_case, text) => {
    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'invalidJson' }],
    });
  });

  it('rejects a truncated backup', async () => {
    const text = serializeBackup(await createBackup(sampleData(), metadata, sha256));

    const parsed = await parseBackup(text.slice(0, text.length / 2), sha256);

    expect(parsed).toEqual({ ok: false, errors: [{ path: '', code: 'invalidJson' }] });
  });

  it('rejects a deeply nested file before parsing it', async () => {
    const depth = 100_000;
    const text = `${'['.repeat(depth)}${']'.repeat(depth)}`;

    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'tooDeep' }],
    });
  });

  it('does not count brackets inside texts as nesting', async () => {
    const backup = await createBackup(
      {
        ...sampleData(),
        cards: [{ ...card('c1', '猫', ['animals']), example: `${'[{'.repeat(50)} "\\` }],
      },
      metadata,
      sha256,
    );

    expect((await parseBackup(serializeBackup(backup), sha256)).ok).toBe(true);
  });

  it('rejects a file larger than 20 MB without reading it', async () => {
    expect(BACKUP_LIMITS.characters).toBe(20 * 1024 * 1024);
    const text = ' '.repeat(BACKUP_LIMITS.characters + 1);

    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'fileTooLarge' }],
    });
  });

  it.each([
    ['a vocabulary pack', { format: 'vocab-learner-pack', version: 1, labels: [], cards: [] }],
    ['a JSON list', []],
    ['a JSON number', 42],
    ['an object without schema version', { format: 'vocab-learner-backup' }],
  ])('rejects %s as not being a backup', async (_case, content) => {
    expect(await parseBackup(JSON.stringify(content), sha256)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'notABackup' }],
    });
  });

  it('refuses a backup written by a newer app, telling which version it needs', async () => {
    const text = await resealed((document) => {
      document['schemaVersion'] = 2;
    });

    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: 'schemaVersion', code: 'newerVersion', version: 2 }],
    });
  });

  it('detects a damaged file through its fingerprint', async () => {
    const text = await backupText((document) => {
      const data = document['data'] as BackupDocument['data'];
      data.cards = [{ ...card('c1', '猫', ['animals']), translation: 'tampered' }];
    });

    expect(await parseBackup(text, sha256)).toEqual({
      ok: false,
      errors: [{ path: 'sha256', code: 'fingerprintMismatch' }],
    });
  });

  it('rejects a backup without fingerprint', async () => {
    const text = await backupText((document) => {
      delete document['sha256'];
    });

    expect(codes(await parseBackup(text, sha256))).toEqual(['fingerprintMismatch']);
  });

  describe('content validation', () => {
    const data = (document: Record<string, unknown>) => document['data'] as Record<string, unknown>;
    const member = (value: unknown, key: string | number) =>
      (value as Record<string | number, unknown>)[key] as Record<string, unknown>;
    const firstCard = (document: Record<string, unknown>) => member(data(document)['cards'], 0);

    it('accepts a backup without progress nor settings yet', async () => {
      const backup = await createBackup(emptyData(), metadata, sha256);

      expect(await parseBackup(serializeBackup(backup), sha256)).toEqual({
        ok: true,
        value: backup,
      });
    });

    it('accepts the typed answers of the flashcards, meaning or word', async () => {
      const data = sampleData();
      data.sessions[0]?.results.push(
        { cardId: 'c1', outcome: 'almost', exercise: 'typeMeaning', rating: 'hard', at: now },
        { cardId: 'c2', outcome: 'wrong', exercise: 'typeEcho', rating: 'again', at: now },
      );
      const backup = await createBackup(data, metadata, sha256);

      expect(await parseBackup(serializeBackup(backup), sha256)).toEqual({
        ok: true,
        value: backup,
      });
    });

    it('keeps a half-point best score, the toneEcho items and the sentences put in order', async () => {
      const data = sampleData();
      data.pathProgress = [
        {
          labelId: 'animals',
          language: 'zh',
          finalChallengeBest: 15.5,
          toneEchoRecent: [true, false],
          shuffledSentences: { c1: true },
        },
      ];
      const backup = await createBackup(data, metadata, sha256);

      expect(await parseBackup(serializeBackup(backup), sha256)).toEqual({
        ok: true,
        value: backup,
      });
    });

    it('accepts the answers of the recognise and sentence games, FSRS-rated or not', async () => {
      const data = sampleData();
      data.sessions[0]?.results.push(
        { cardId: 'c1', outcome: 'correct', exercise: 'bridgeMatch', rating: 'good', at: now },
        { cardId: 'c1', outcome: 'wrong', exercise: 'toneEcho', at: now },
        { cardId: 'c2', outcome: 'correct', exercise: 'sentenceListen', rating: 'good', at: now },
        { cardId: 'c2', outcome: 'correctWithHint', exercise: 'sentenceShuffle', at: now },
      );
      const backup = await createBackup(data, metadata, sha256);

      expect(await parseBackup(serializeBackup(backup), sha256)).toEqual({
        ok: true,
        value: backup,
      });
    });

    it('rejects an answer from an unknown exercise', async () => {
      const text = await resealed((document) => {
        const sessions = (document['data'] as Record<string, unknown>)['sessions'] as {
          results: Record<string, unknown>[];
        }[];
        sessions[0]?.results.push({ cardId: 'c1', outcome: 'correct', exercise: '__proto__' });
      });

      expect((await parseBackup(text, sha256)).ok).toBe(false);
    });

    it('keeps the way of answering the flashcards chosen by the learner', async () => {
      const data = sampleData();
      data.settings = { ...data.settings, answerMode: 'mixed' };
      const backup = await createBackup(data, metadata, sha256);

      expect(await parseBackup(serializeBackup(backup), sha256)).toEqual({
        ok: true,
        value: backup,
      });
    });

    it('refuses an unknown way of answering the flashcards', async () => {
      const text = await resealed((document) => {
        member(data(document), 'settings')['answerMode'] = '<img src=x>';
      });

      expect(await parseBackup(text, sha256)).toEqual({
        ok: false,
        errors: [{ path: 'data.settings.answerMode', code: 'invalid_value' }],
      });
    });

    it('refuses an unknown field, wherever it is', async () => {
      const text = await resealed((document) => {
        firstCard(document)['script'] = 'alert(1)';
      });

      expect(await parseBackup(text, sha256)).toEqual({
        ok: false,
        errors: [{ path: 'data.cards.0', code: 'unrecognized_keys' }],
      });
    });

    it('refuses a __proto__ key and leaves the object prototype untouched', async () => {
      const text = (await backupText()).replace(
        '"term":"猫"',
        '"__proto__":{"polluted":true},"term":"猫"',
      );

      const parsed = await parseBackup(text, sha256);

      expect(parsed).toEqual({
        ok: false,
        errors: [{ path: 'data.cards.0.__proto__', code: 'forbiddenKey' }],
      });
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it.each([
      ['a control character in a word', 'term', `猫${String.fromCodePoint(0x1b)}`, 'custom'],
      [
        'a bidi override in a translation',
        'translation',
        `a${String.fromCodePoint(0x202e)}b`,
        'custom',
      ],
      ['a too long translation', 'translation', 'x'.repeat(301), 'too_big'],
      ['an empty word', 'term', '   ', 'too_small'],
      ['an unknown language', 'language', 'fr', 'invalid_value'],
      ['an identifier with markup', 'id', '<img onerror=x>', 'invalid_format'],
      ['a date that is not ISO', 'createdAt', 'yesterday', 'invalid_format'],
      ['a number instead of a text', 'translation', 42, 'invalid_type'],
    ])('refuses %s', async (_case, field, value, code) => {
      const text = await resealed((document) => {
        firstCard(document)[field] = value;
      });

      expect(await parseBackup(text, sha256)).toEqual({
        ok: false,
        errors: [{ path: `data.cards.0.${field}`, code }],
      });
    });

    it.each([
      ['a label colour that could inject CSS', ['labels', 0, 'color'], 'red;background:url(x)'],
      ['a negative stability', ['reviewStates', 0, 'stability'], -1],
      ['a fractional review count', ['reviewStates', 0, 'reps'], 1.5],
      ['an unknown stage', ['reviewStates', 0, 'peakStage'], 'tree'],
      ['an invalid day', ['reviewStates', 0, 'lastSuccessDay'], '2026-13-45'],
      ['a test date that is not a day', ['labels', 0, 'examDate'], '13/11/2026'],
      ['a past test date with markup', ['labels', 0, 'pastExamDate'], '<b>2026</b>'],
      ['an unpinning day that is not a day', ['labels', 0, 'unfocusedOn'], 'yesterday'],
      ['an unknown session outcome', ['sessions', 0, 'results', 0, 'outcome'], 'perfect'],
      ['a negative xp', ['progress', 'xp'], -5],
      ['a negative count of answers today', ['progress', 'dailyAnswers'], -1],
      ['a streak day that is not a day', ['progress', 'lastStreakDay'], '<script>'],
      ['a volume above 100 %', ['settings', 'sfxVolume'], 1.5],
      ['an unknown path step status', ['pathProgress', 0, 'steps', 'listen'], 'flying'],
      ['a final challenge score above 20', ['pathProgress', 0, 'finalChallengeBest'], 21],
      ['a score off the half points', ['pathProgress', 0, 'finalChallengeBest'], 15.3],
    ])('refuses %s', async (_case, path, value) => {
      const text = await resealed((document) => {
        let target = data(document);
        for (const key of path.slice(0, -1)) {
          target = target[key] as Record<string, unknown>;
        }
        target[path.at(-1) as string] = value;
      });

      const parsed = await parseBackup(text, sha256);

      expect(parsed.ok).toBe(false);
      expect(parsed.ok ? [] : parsed.errors.map((issue) => issue.path)).toEqual([
        `data.${path.join('.')}`,
      ]);
    });

    it.each([
      ['a toneEcho item that is no result', 'toneEchoRecent', ['yes'], 'toneEchoRecent.0'],
      [
        'a sentence put in order by no result',
        'shuffledSentences',
        { c1: 1 },
        'shuffledSentences.c1',
      ],
    ])('refuses %s', async (_case, field, value, issuePath) => {
      const text = await resealed((document) => {
        member(data(document)['pathProgress'], 0)[field] = value;
      });

      const parsed = await parseBackup(text, sha256);

      expect(parsed.ok ? [] : parsed.errors.map((issue) => issue.path)).toEqual([
        `data.pathProgress.0.${issuePath}`,
      ]);
    });

    it('refuses an unknown path step', async () => {
      const text = await resealed((document) => {
        member(data(document)['pathProgress'], 0)['steps'] = { fly: 'current' };
      });

      expect(await parseBackup(text, sha256)).toMatchObject({
        ok: false,
        errors: [{ path: 'data.pathProgress.0.steps' }],
      });
    });

    it('refuses more words than a profile can hold', async () => {
      const text = await resealed((document) => {
        data(document)['cards'] = Array.from({ length: BACKUP_LIMITS.cards + 1 }, (_, index) =>
          card(`c${String(index)}`, `word${String(index)}`, [], 'en'),
        );
      });

      expect(await parseBackup(text, sha256)).toEqual({
        ok: false,
        errors: [{ path: 'data.cards', code: 'too_big' }],
      });
    });

    it('refuses a profile name with control characters', async () => {
      const text = await resealed((document) => {
        document['profileName'] = `Léa${String.fromCodePoint(0x07)}`;
      });

      expect(codes(await parseBackup(text, sha256))).toEqual(['custom']);
    });
  });

  describe('consistency', () => {
    async function issuesOf(edit: (data: BackupData) => void) {
      const data = sampleData();
      edit(data);
      const backup = await createBackup(data, metadata, sha256);
      const parsed = await parseBackup(serializeBackup(backup), sha256);
      return parsed.ok ? [] : parsed.errors;
    }

    it.each<[string, (data: BackupData) => void, string, string]>([
      [
        'the same word twice',
        (data) => data.cards.push(card('c3', '猫')),
        'data.cards.2.term',
        'duplicateWord',
      ],
      [
        'the same English word with another case',
        (data) => data.cards.push(card('c3', 'Apple', [], 'en')),
        'data.cards.2.term',
        'duplicateWord',
      ],
      [
        'two words with the same id',
        (data) => data.cards.push(card('c1', '狗')),
        'data.cards.2.id',
        'duplicateCard',
      ],
      [
        'two labels with the same id',
        (data) => data.labels.push(label('animals', 'Autres')),
        'data.labels.1.id',
        'duplicateLabel',
      ],
      [
        'a word carrying an unknown label',
        (data) => data.cards.push(card('c3', '狗', ['ghost'])),
        'data.cards.2.labelIds.0',
        'unknownLabel',
      ],
      [
        'the progress of an unknown word',
        (data) => data.reviewStates.push(reviewState('ghost')),
        'data.reviewStates.1.cardId',
        'unknownCard',
      ],
      [
        'two progress records for one word',
        (data) => data.reviewStates.push(reviewState('c1')),
        'data.reviewStates.1.cardId',
        'duplicateReviewState',
      ],
      [
        'the same ignored term twice',
        (data) => data.ignoredTerms.push({ language: 'en', term: 'the' }),
        'data.ignoredTerms.1.term',
        'duplicateIgnoredTerm',
      ],
      [
        'two sessions with the same id',
        (data) =>
          data.sessions.push({
            id: 's1',
            language: 'en',
            startedAt: '2026-11-04T10:00:00Z',
            results: [],
          }),
        'data.sessions.1.id',
        'duplicateSession',
      ],
      [
        'the path of an unknown label',
        (data) => data.pathProgress.push({ labelId: 'ghost', language: 'zh' }),
        'data.pathProgress.1.labelId',
        'unknownLabel',
      ],
      [
        'the same path twice',
        (data) => data.pathProgress.push({ labelId: 'animals', language: 'zh' }),
        'data.pathProgress.1.labelId',
        'duplicatePath',
      ],
    ])('refuses %s', async (_case, edit, path, code) => {
      expect(await issuesOf(edit)).toEqual([{ path, code }]);
    });

    it('accepts the same path for both languages and sessions about deleted words', async () => {
      const issues = await issuesOf((data) => {
        data.pathProgress.push({ labelId: 'animals', language: 'en' });
        data.sessions.push({
          id: 's2',
          language: 'zh',
          startedAt: '2026-11-04T10:00:00Z',
          results: [{ cardId: 'deleted-word', outcome: 'wrong' }],
        });
      });

      expect(issues).toEqual([]);
    });
  });
});
