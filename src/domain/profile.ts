import { failure, success, type Result } from './result';
import { INVISIBLE_CONTROLS } from './safeText';
import { checkText } from './text';

/**
 * A learner on this device (DESIGN §3): a free pseudonym, never a real name, and no password,
 * as profiles are a comfort for a family computer, not a security boundary.
 */
export interface Profile {
  id: string;
  displayName: string;
  /** An emoji picked by the learner, if any. */
  avatar?: string;
  /** ISO datetime. */
  createdAt: string;
}

/** The profile of the data saved before profiles existed: its database keeps its name. */
export const DEFAULT_PROFILE = { id: 'default', displayName: 'Moi' } as const;

export const PROFILE_NAME_MAX_LENGTH = 30;

export type ProfileNameError = 'required' | 'tooLong' | 'invalidCharacters';

/** One database per profile: the isolation needs no profile id anywhere in the data. */
export function profileDatabaseName(profileId: string): string {
  return `vocab-learner-${profileId}`;
}

/** A pseudonym is shown everywhere and written into file names: bounded, one plain line. */
export function checkProfileName(raw: string): Result<string, ProfileNameError> {
  if (INVISIBLE_CONTROLS.test(raw)) {
    return failure(['invalidCharacters']);
  }
  return checkText(raw, PROFILE_NAME_MAX_LENGTH);
}

export type ProfileError = ProfileNameError | 'nameTaken' | 'profileNotFound';

/** Two pseudonyms are the same when they differ only by case or Unicode form. */
const nameKey = (name: string) => name.normalize('NFC').toLowerCase();

function checkFreeName(
  profiles: readonly Profile[],
  raw: string,
  ownId?: string,
): Result<string, ProfileError> {
  const name = checkProfileName(raw);
  if (!name.ok) {
    return name;
  }
  const taken = profiles.some(
    ({ id, displayName }) => id !== ownId && nameKey(displayName) === nameKey(name.value),
  );
  return taken ? failure(['nameTaken']) : name;
}

export function createProfile(
  profiles: readonly Profile[],
  rawName: string,
  context: { id: string; now: string },
): Result<Profile, ProfileError> {
  const name = checkFreeName(profiles, rawName);
  return name.ok
    ? success({ id: context.id, displayName: name.value, createdAt: context.now })
    : name;
}

export function renameProfile(
  profiles: readonly Profile[],
  profileId: string,
  rawName: string,
): Result<Profile[], ProfileError> {
  if (!profiles.some(({ id }) => id === profileId)) {
    return failure(['profileNotFound']);
  }
  const name = checkFreeName(profiles, rawName, profileId);
  if (!name.ok) {
    return name;
  }
  return success(
    profiles.map((profile) =>
      profile.id === profileId ? { ...profile, displayName: name.value } : profile,
    ),
  );
}

/** The app reopens on the profile used last, or on the first one. */
export function startProfile(
  profiles: readonly Profile[],
  lastUsedId: string | undefined,
): Profile | undefined {
  return profiles.find(({ id }) => id === lastUsedId) ?? profiles[0];
}

/** Ids name databases: short plain tokens, never the name of the list of profiles itself. */
const PROFILE_ID = /^[A-Za-z0-9-]{1,64}$/;
const RESERVED_IDS: ReadonlySet<string> = new Set(['profiles']);

export function isValidProfileId(id: string): boolean {
  return PROFILE_ID.test(id) && !RESERVED_IDS.has(id);
}
