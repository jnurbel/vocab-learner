export interface UpdateBannerContext {
  /** A new version of the app was downloaded and waits to take over. */
  updateReady: boolean;
  /** The user chose "Plus tard" for this version. */
  dismissed: boolean;
  /** A study session may be under way: the banner waits for the end of it. */
  studying: boolean;
}

/**
 * The "new version" banner never interrupts a study session, and the update itself waits for
 * a click: the app is never reloaded by force.
 */
export function updateBannerVisible({ updateReady, dismissed, studying }: UpdateBannerContext) {
  return updateReady && !dismissed && !studying;
}
