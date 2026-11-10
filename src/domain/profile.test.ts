import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  PROFILE_NAME_MAX_LENGTH,
  checkProfileName,
  isValidProfileId,
  createProfile,
  profileDatabaseName,
  renameProfile,
  startProfile,
  type Profile,
} from './profile';

describe('profileDatabaseName', () => {
  it('keeps the database of the first profile, so that the words already saved are found', () => {
    expect(DEFAULT_PROFILE).toEqual({ id: 'default', displayName: 'Moi' });
    expect(profileDatabaseName(DEFAULT_PROFILE.id)).toBe('vocab-learner-default');
  });

  it('gives each profile a database of its own', () => {
    expect(profileDatabaseName('0b9f6a1e-3c4d-4e5f-8a9b-0c1d2e3f4a5b')).toBe(
      'vocab-learner-0b9f6a1e-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
    );
  });
});

describe('checkProfileName', () => {
  it('accepts a free pseudonym, trimmed', () => {
    expect(checkProfileName('  Petit dragon 🐉 ')).toEqual({ ok: true, value: 'Petit dragon 🐉' });
  });

  it('refuses an empty pseudonym', () => {
    expect(checkProfileName('   ')).toEqual({ ok: false, errors: ['required'] });
  });

  it('refuses a pseudonym longer than the maximum, counted in characters', () => {
    expect(checkProfileName('龙'.repeat(PROFILE_NAME_MAX_LENGTH)).ok).toBe(true);
    expect(checkProfileName('龙'.repeat(PROFILE_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      errors: ['tooLong'],
    });
  });

  it.each([
    ['a line break', 'Léa\nadmin'],
    ['a NUL character', `Léa${String.fromCodePoint(0)}`],
    ['a right-to-left override', `Léa${String.fromCodePoint(0x202e)}exe`],
    ['a bidi isolate', `${String.fromCodePoint(0x2066)}Léa`],
  ])('refuses a pseudonym containing %s', (_name, raw) => {
    expect(checkProfileName(raw)).toEqual({ ok: false, errors: ['invalidCharacters'] });
  });

  it('keeps markup as plain text, to be escaped when displayed', () => {
    expect(checkProfileName('<b>Léa</b>')).toEqual({ ok: true, value: '<b>Léa</b>' });
  });
});

const now = '2026-11-10T08:00:00.000Z';
const me: Profile = { id: 'default', displayName: 'Moi', createdAt: now };
const brother: Profile = { id: 'b-1', displayName: 'Tom', createdAt: now };

describe('createProfile', () => {
  it('creates a profile with a free pseudonym', () => {
    expect(createProfile([me], ' Léa ', { id: 'p-2', now })).toEqual({
      ok: true,
      value: { id: 'p-2', displayName: 'Léa', createdAt: now },
    });
  });

  it('refuses a pseudonym another profile already has, whatever its case', () => {
    expect(createProfile([me, brother], 'tom', { id: 'p-2', now })).toEqual({
      ok: false,
      errors: ['nameTaken'],
    });
  });

  it('refuses an invalid pseudonym', () => {
    expect(createProfile([me], '', { id: 'p-2', now })).toEqual({
      ok: false,
      errors: ['required'],
    });
  });
});

describe('renameProfile', () => {
  it('renames a profile and leaves the others as they are', () => {
    expect(renameProfile([me, brother], 'b-1', 'Thomas')).toEqual({
      ok: true,
      value: [me, { ...brother, displayName: 'Thomas' }],
    });
  });

  it('lets a profile keep its own name with another case', () => {
    expect(renameProfile([me, brother], 'b-1', 'TOM').ok).toBe(true);
  });

  it('refuses the pseudonym of another profile, or an invalid one', () => {
    expect(renameProfile([me, brother], 'b-1', 'moi')).toEqual({
      ok: false,
      errors: ['nameTaken'],
    });
    expect(renameProfile([me, brother], 'b-1', 'x'.repeat(31))).toEqual({
      ok: false,
      errors: ['tooLong'],
    });
  });

  it('says so when the profile no longer exists', () => {
    expect(renameProfile([me], 'ghost', 'Léa')).toEqual({
      ok: false,
      errors: ['profileNotFound'],
    });
  });
});

describe('startProfile', () => {
  it('opens on the profile used last', () => {
    expect(startProfile([me, brother], 'b-1')).toBe(brother);
  });

  it('opens on the first profile when the last one used is unknown or was deleted', () => {
    expect(startProfile([me, brother], undefined)).toBe(me);
    expect(startProfile([me, brother], 'deleted')).toBe(me);
  });
});

describe('isValidProfileId', () => {
  it('accepts the first profile and generated identifiers', () => {
    expect(isValidProfileId('default')).toBe(true);
    expect(isValidProfileId('0b9f6a1e-3c4d-4e5f-8a9b-0c1d2e3f4a5b')).toBe(true);
  });

  it.each(['', 'profiles', '../x', 'a b', 'a/b', 'x'.repeat(65), '<script>'])(
    'refuses an identifier that would not name a database of its own: %j',
    (id) => {
      expect(isValidProfileId(id)).toBe(false);
    },
  );
});
