// @vitest-environment node
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Card } from '../domain/card';
import { profileDatabaseName, type Profile } from '../domain/profile';
import { PROFILES_DATABASE, ProfileRegistry } from './profileRegistry';
import { StudyRepository } from './studyRepository';
import { VocabularyRepository } from './vocabularyRepository';

const now = '2026-11-10T08:00:00.000Z';
const later = '2026-11-11T08:00:00.000Z';

function card(id: string, term: string): Card {
  return {
    id,
    language: 'en',
    term,
    translation: `meaning of ${term}`,
    labelIds: [],
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

const lea: Profile = {
  id: '0b9f6a1e-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
  displayName: 'Léa',
  createdAt: later,
};

let registry: ProfileRegistry;

beforeEach(() => {
  registry = new ProfileRegistry();
});

afterEach(async () => {
  await Promise.all(
    [PROFILES_DATABASE, profileDatabaseName('default'), profileDatabaseName(lea.id)].map((name) =>
      Dexie.delete(name),
    ),
  );
});

describe('ProfileRegistry', () => {
  it('lives in a small database of its own', () => {
    expect(PROFILES_DATABASE).toBe('vocab-learner-profiles');
  });

  it('turns the words saved before profiles existed into the profile "Moi", without moving them', async () => {
    const words = new VocabularyRepository('vocab-learner-default');
    await words.saveImport({ cardsToCreate: [card('c1', 'cat')], cardsToUpdate: [] });

    const profiles = await registry.profiles(now);

    expect(profiles).toEqual([{ id: 'default', displayName: 'Moi', createdAt: now }]);
    expect(await new VocabularyRepository(profileDatabaseName('default')).allCards()).toEqual([
      card('c1', 'cat'),
    ]);
  });

  it('creates the profile "Moi" once only', async () => {
    await registry.profiles(now);

    expect(await new ProfileRegistry().profiles(later)).toEqual([
      { id: 'default', displayName: 'Moi', createdAt: now },
    ]);
  });
});

describe('ProfileRegistry changes', () => {
  it('adds a profile after the first one', async () => {
    await registry.profiles(now);

    await registry.add(lea);

    expect((await registry.profiles(now)).map(({ displayName }) => displayName)).toEqual([
      'Moi',
      'Léa',
    ]);
  });

  it('refuses an identifier that would not name a database of its own', async () => {
    for (const id of ['profiles', '../x', '', 'a b']) {
      await expect(registry.add({ ...lea, id })).rejects.toThrow('Invalid profile id');
    }
    expect(await registry.profiles(now)).toHaveLength(1);
  });

  it('stores a new pseudonym', async () => {
    await registry.add(lea);

    await registry.save({ ...lea, displayName: 'Léa la grande' });

    expect(await registry.profiles(now)).toContainEqual({ ...lea, displayName: 'Léa la grande' });
  });

  it('remembers the profile used last, from one visit to the next', async () => {
    expect(await registry.lastUsedId()).toBeUndefined();

    await registry.markUsed(lea.id);

    expect(await new ProfileRegistry().lastUsedId()).toBe(lea.id);
  });
});

describe('ProfileRegistry deletion', () => {
  it('deletes a profile with all its data, and only its data', async () => {
    await registry.profiles(now);
    await registry.add(lea);
    await new VocabularyRepository(profileDatabaseName('default')).saveImport({
      cardsToCreate: [card('c1', 'cat')],
      cardsToUpdate: [],
    });
    await new VocabularyRepository(profileDatabaseName(lea.id)).saveImport({
      cardsToCreate: [card('c2', 'dog')],
      cardsToUpdate: [],
    });
    await registry.markUsed(lea.id);

    await registry.remove(lea.id);

    expect(await registry.profiles(now)).toHaveLength(1);
    expect(await Dexie.exists(profileDatabaseName(lea.id))).toBe(false);
    expect(await new VocabularyRepository(profileDatabaseName('default')).allCards()).toHaveLength(
      1,
    );
    expect(await registry.lastUsedId()).toBeUndefined();
  });

  it('keeps the profile used last when another one is deleted', async () => {
    await registry.profiles(now);
    await registry.add(lea);
    await registry.markUsed('default');

    await registry.remove(lea.id);

    expect(await registry.lastUsedId()).toBe('default');
  });

  it('never deletes a database that is not a profile, such as the list of profiles', async () => {
    await registry.profiles(now);
    await registry.add(lea);

    await expect(registry.remove('profiles')).rejects.toThrow('Invalid profile id');
    await expect(registry.remove('ghost')).rejects.toThrow('Unknown profile');

    expect(await registry.profiles(now)).toHaveLength(2);
  });

  it('never deletes the last profile', async () => {
    await registry.profiles(now);

    await expect(registry.remove('default')).rejects.toThrow('The last profile cannot be deleted');
    expect(await registry.profiles(now)).toHaveLength(1);
  });
});

describe('profile databases', () => {
  it('keep the words, the progress and the settings of each profile apart', async () => {
    const mine = profileDatabaseName('default');
    const hers = profileDatabaseName(lea.id);
    await new VocabularyRepository(mine).saveImport({
      cardsToCreate: [card('c1', 'cat')],
      cardsToUpdate: [],
    });
    await new StudyRepository(mine).saveNewPerDay(5);
    await new StudyRepository(mine).recordProgress(() => ({ xp: 120 }));

    expect(await new VocabularyRepository(hers).allCards()).toEqual([]);
    const herStudy = await new StudyRepository(hers).load(now);
    expect(herStudy.progress).toBeUndefined();
    expect(herStudy.settings).toBeUndefined();
    expect((await new StudyRepository(mine).load(now)).progress).toEqual({ xp: 120 });
  });
});
