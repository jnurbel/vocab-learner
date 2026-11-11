/** What the app offers to install it: the browser's prompt, written steps for iOS, or nothing. */
export type InstallOffer = 'prompt' | 'iosHelp' | 'none';

export interface InstallContext {
  /** The app already runs installed (standalone window or home screen icon). */
  installed: boolean;
  /** The browser fired `beforeinstallprompt` (Chrome, Edge, Android) and kept the prompt. */
  promptAvailable: boolean;
  /** iPhone or iPad: no prompt there, the user installs from the Share menu. */
  ios: boolean;
}

/** The install button only shows where the browser can install; iOS gets its written steps. */
export function installOffer({ installed, promptAvailable, ios }: InstallContext): InstallOffer {
  if (installed) {
    return 'none';
  }
  if (promptAvailable) {
    return 'prompt';
  }
  return ios ? 'iosHelp' : 'none';
}

export interface DeviceHints {
  userAgent: string;
  maxTouchPoints: number;
}

/** iPhone, iPod or iPad; an iPad on iPadOS 13+ calls itself a Mac, but a Mac has no touch screen. */
export function isIosDevice({ userAgent, maxTouchPoints }: DeviceHints): boolean {
  return (
    /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1)
  );
}
