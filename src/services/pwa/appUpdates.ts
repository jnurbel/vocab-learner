/** The service worker registration, as far as the update checks need it. */
export interface UpdatableRegistration {
  update(): Promise<unknown>;
}

/** The part of `registerSW` (virtual:pwa-register) used here, so that tests can replace it. */
export type RegisterServiceWorker = (options: {
  onNeedRefresh?: () => void;
  onRegisteredSW?: (url: string, registration: UpdatableRegistration | undefined) => void;
}) => (reloadPage?: boolean) => Promise<void>;

/** New versions of the app, as the service worker finds them. */
export interface AppUpdates {
  /** Called once a new version waits; at once if one already waits. */
  onUpdateReady(listener: () => void): void;
  /** Lets the waiting version take over; the page reloads once it controls it. */
  applyUpdate(): Promise<void>;
}

/** No service worker (dev server, tests): no update ever. */
export const noAppUpdates: AppUpdates = {
  onUpdateReady: () => undefined,
  applyUpdate: () => Promise.resolve(),
};

/** How often an app left open looks for a new version. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export interface AppUpdateOptions {
  /** Repeats a check; `setInterval` by default. */
  every?: (check: () => void, ms: number) => void;
}

const repeat = (check: () => void, ms: number) => {
  setInterval(check, ms);
};

/**
 * Registers the service worker in "prompt" mode: a new version is downloaded in the background
 * and waits; it takes over only when the user asks, so that no session is cut by a reload.
 */
export function appUpdatesFrom(
  register: RegisterServiceWorker,
  { every = repeat }: AppUpdateOptions = {},
): AppUpdates {
  let ready = false;
  const listeners: (() => void)[] = [];
  const update = register({
    onNeedRefresh() {
      ready = true;
      for (const listener of listeners) {
        listener();
      }
    },
    onRegisteredSW(_url, registration) {
      if (registration !== undefined) {
        every(() => {
          // Offline, or the site unreachable: the next check tries again.
          registration.update().catch(() => undefined);
        }, UPDATE_CHECK_INTERVAL_MS);
      }
    },
  });
  return {
    onUpdateReady(listener) {
      listeners.push(listener);
      if (ready) {
        listener();
      }
    },
    applyUpdate: () => update(true),
  };
}
