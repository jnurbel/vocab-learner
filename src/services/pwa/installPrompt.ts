import { isIosDevice } from '../../domain/pwa/installOffer';

/** The `beforeinstallprompt` event of Chrome and Edge; not in the DOM typings. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallEventType = 'beforeinstallprompt' | 'appinstalled';

/** The part of `window` used to install the app. */
export interface InstallHost {
  addEventListener(type: InstallEventType, listener: (event: Event) => void): void;
  removeEventListener(type: InstallEventType, listener: (event: Event) => void): void;
  matchMedia?: (query: string) => { matches: boolean };
  readonly navigator: {
    readonly userAgent: string;
    readonly maxTouchPoints: number;
    /** Safari on iOS: true when opened from the home screen. */
    readonly standalone?: boolean;
  };
}

export interface InstallState {
  installed: boolean;
  promptAvailable: boolean;
  ios: boolean;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallWatch {
  /** Shows the browser's install dialog; to be called from a click. */
  install(): Promise<InstallOutcome>;
  stop(): void;
}

function runsInstalled(host: InstallHost): boolean {
  return (
    host.navigator.standalone === true ||
    host.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

/**
 * Keeps the install prompt the browser offers, to show it from the "Installer l'appli" button
 * rather than at a moment the app did not choose, and reports the state after each change.
 * `onInstalled` runs when the app was just installed, and at once when it already runs installed.
 */
export function watchInstall(
  host: InstallHost,
  onChange: (state: InstallState) => void,
  onInstalled: () => void,
): InstallWatch {
  let prompt: InstallPromptEvent | undefined;
  let installed = runsInstalled(host);
  const ios = isIosDevice(host.navigator);

  const report = () => {
    onChange({ installed, promptAvailable: prompt !== undefined, ios });
  };
  const keepPrompt = (event: Event) => {
    // Without this, the browser may show its own install bar at any moment.
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    report();
  };
  const installedNow = () => {
    installed = true;
    prompt = undefined;
    report();
    onInstalled();
  };

  host.addEventListener('beforeinstallprompt', keepPrompt);
  host.addEventListener('appinstalled', installedNow);
  report();
  if (installed) {
    onInstalled();
  }

  return {
    async install() {
      const shown = prompt;
      if (shown === undefined) {
        return 'unavailable';
      }
      // A prompt can be shown only once: the browser fires a new event if it may ask again.
      prompt = undefined;
      report();
      await shown.prompt();
      return (await shown.userChoice).outcome;
    },
    stop() {
      host.removeEventListener('beforeinstallprompt', keepPrompt);
      host.removeEventListener('appinstalled', installedNow);
    },
  };
}
