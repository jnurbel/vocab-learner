import { Dexie, type EntityTable, type Table } from 'dexie';
import {
  DEFAULT_PROFILE,
  isValidProfileId,
  profileDatabaseName,
  type Profile,
} from '../domain/profile';

/** The list of the profiles of this device, apart from their own databases. */
export const PROFILES_DATABASE = 'vocab-learner-profiles';

const LAST_USED = 'lastUsedProfileId';

class ProfilesDatabase extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  /** Small key-value store: the profile used last. */
  meta!: Table<string, string>;

  constructor() {
    super(PROFILES_DATABASE);
    this.version(1).stores({ profiles: 'id, createdAt', meta: '' });
  }
}

/** Lists, creates, renames and deletes the profiles of this device (DESIGN §3). */
export class ProfileRegistry {
  private readonly db = new ProfilesDatabase();

  /**
   * The profiles, the first one first. On first use, the data saved before profiles existed
   * becomes the profile "Moi": its database keeps its name, so nothing is copied nor lost.
   */
  async profiles(now: string): Promise<Profile[]> {
    return this.db.transaction('rw', this.db.profiles, async () => {
      if ((await this.db.profiles.count()) === 0) {
        await this.db.profiles.add({ ...DEFAULT_PROFILE, createdAt: now });
      }
      return this.db.profiles.orderBy('createdAt').toArray();
    });
  }

  async add(profile: Profile): Promise<void> {
    if (!isValidProfileId(profile.id)) {
      throw new Error('Invalid profile id');
    }
    await this.db.profiles.add(profile);
  }

  /** Stores a profile changed by the domain (a new pseudonym). */
  async save(profile: Profile): Promise<void> {
    await this.db.profiles.put(profile);
  }

  async lastUsedId(): Promise<string | undefined> {
    return this.db.meta.get(LAST_USED);
  }

  async markUsed(profileId: string): Promise<void> {
    await this.db.meta.put(profileId, LAST_USED);
  }

  /** Deletes a profile and its whole database; the last profile always stays. */
  async remove(profileId: string): Promise<void> {
    if (!isValidProfileId(profileId)) {
      throw new Error('Invalid profile id');
    }
    await this.db.transaction('rw', this.db.profiles, this.db.meta, async () => {
      if ((await this.db.profiles.get(profileId)) === undefined) {
        throw new Error('Unknown profile');
      }
      if ((await this.db.profiles.count()) <= 1) {
        throw new Error('The last profile cannot be deleted');
      }
      await this.db.profiles.delete(profileId);
      if ((await this.db.meta.get(LAST_USED)) === profileId) {
        await this.db.meta.delete(LAST_USED);
      }
    });
    await Dexie.delete(profileDatabaseName(profileId));
  }
}
