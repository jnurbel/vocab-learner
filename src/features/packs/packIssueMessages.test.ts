import { describe, expect, it } from 'vitest';
import { parseVocabPack } from '../../domain/vocabPack';
import { packIssueMessages } from './packIssueMessages';

function messagesOf(text: string): string[] {
  const parsed = parseVocabPack(text);
  return parsed.ok ? [] : packIssueMessages(parsed.errors);
}

const word = { language: 'en', term: 'cat', translation: 'chat', labelIds: [] };

function packText(extra: Record<string, unknown>): string {
  return JSON.stringify({
    format: 'vocab-learner-pack',
    version: 1,
    labels: [],
    cards: [word],
    ...extra,
  });
}

describe('packIssueMessages', () => {
  it('explains a file that is not readable JSON', () => {
    expect(messagesOf('{oops')).toEqual([
      'Ce fichier est abîmé ou n’est pas une liste de mots : son contenu est illisible.',
    ]);
  });

  it('explains a file that is too large or could not be read', () => {
    expect(packIssueMessages([{ path: '', code: 'fileTooLarge' }])).toEqual([
      'Ce fichier est trop gros pour être une liste de mots (2 Mo au maximum).',
    ]);
    expect(packIssueMessages([{ path: '', code: 'unreadableFile' }])).toEqual([
      'Ce fichier n’a pas pu être lu. Réessaie ou choisis-en un autre.',
    ]);
  });

  it('explains a file of another kind, such as a backup', () => {
    expect(messagesOf(JSON.stringify({ format: 'vocab-learner-backup' }))).toContain(
      'Ce fichier n’est pas une liste de mots de vocab-learner.',
    );
    expect(messagesOf('[]')).toEqual(['Ce fichier n’est pas une liste de mots de vocab-learner.']);
  });

  it('refuses a file carrying unexpected data, such as progress or __proto__', () => {
    expect(messagesOf(packText({ progress: { xp: 1 } }))).toEqual([
      'Le fichier contient des données inattendues : il est refusé.',
    ]);
    expect(messagesOf(packText({}).replace('{', '{"__proto__":{"x":1},'))).toEqual([
      'Le fichier contient des données inattendues : il est refusé.',
    ]);
  });

  it('points to the word or the label that is wrong, counting from 1', () => {
    const bidi = `pom${String.fromCodePoint(0x202e)}me`;

    expect(
      messagesOf(packText({ cards: [word, { ...word, term: 'dog', translation: bidi }] })),
    ).toEqual([
      'Mot n° 2 : une donnée est vide, trop longue ou contient des caractères interdits.',
    ]);
    expect(messagesOf(packText({ labels: [{ id: 'a', name: '' }] }))).toEqual([
      'Label n° 1 : une donnée est vide, trop longue ou contient des caractères interdits.',
    ]);
  });

  it('explains duplicates and words referring to a missing label', () => {
    expect(messagesOf(packText({ cards: [word, { ...word, term: 'CAT' }] }))).toEqual([
      'Mot n° 2 : ce mot est déjà dans le fichier.',
    ]);
    expect(messagesOf(packText({ cards: [{ ...word, labelIds: ['ghost'] }] }))).toEqual([
      'Mot n° 1 : ce mot fait référence à un label absent du fichier.',
    ]);
    expect(
      messagesOf(
        packText({
          labels: [
            { id: 'a', name: 'A' },
            { id: 'a', name: 'B' },
          ],
        }),
      ),
    ).toEqual(['Label n° 2 : deux labels ont le même identifiant.']);
  });

  it('explains a list that is too long', () => {
    expect(packIssueMessages([{ path: 'cards', code: 'too_big' }])).toEqual([
      'Le fichier contient trop de mots ou de labels (5 000 mots et 500 labels au maximum).',
    ]);
  });

  it('shows a few problems only, then how many more there are', () => {
    const issues = Array.from({ length: 8 }, (_, index) => ({
      path: `cards.${String(index)}.term`,
      code: 'duplicateWord',
    }));

    const messages = packIssueMessages(issues);

    expect(messages).toHaveLength(6);
    expect(messages[5]).toBe('Et 3 autre(s) problème(s).');
  });

  it('falls back to a general message for an unknown problem', () => {
    expect(packIssueMessages([])).toEqual([
      'Ce fichier ne peut pas être importé : ce n’est pas une liste de mots valide.',
    ]);
    expect(packIssueMessages([{ path: 'x', code: 'whatever' }])).toEqual([
      'Ce fichier ne peut pas être importé : ce n’est pas une liste de mots valide.',
    ]);
  });
});
