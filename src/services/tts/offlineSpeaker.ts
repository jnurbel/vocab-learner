import type { Language } from '../../domain/card';
import type { Speaker, VoiceCatalog, VoiceReport } from './speaker';

/** The voice chosen for the language goes through the Internet, and the device is offline. */
export class VoiceOfflineError extends Error {
  constructor(language: Language) {
    super(`The ${language} voice needs the network, and the device is offline`);
    this.name = 'VoiceOfflineError';
  }
}

const LANGUAGES: readonly Language[] = ['zh', 'en'];

/**
 * The languages whose chosen voice is an online one (Edge "Natural", Chrome "Google"):
 * they are silent without a network. A voice that does not tell is taken as local.
 */
export function onlineOnlyLanguages(report: VoiceReport): Language[] {
  return LANGUAGES.filter((language) => report.chosen[language]?.localService === false);
}

/**
 * Offline, an online voice is treated as missing: the screens show the word written instead
 * of waiting for a reading that never comes.
 */
export function offlineAwareSpeaker(
  base: Speaker & VoiceCatalog,
  isOnline: () => boolean,
): Speaker & VoiceCatalog {
  async function silentOffline(language: Language): Promise<boolean> {
    if (isOnline()) {
      return false;
    }
    return onlineOnlyLanguages(await base.voiceReport()).includes(language);
  }

  return {
    voiceReport: () => base.voiceReport(),
    reloadVoices: () => base.reloadVoices(),
    async hasVoice(language) {
      return (await base.hasVoice(language)) && !(await silentOffline(language));
    },
    async speak(text, language, options) {
      if (await silentOffline(language)) {
        throw new VoiceOfflineError(language);
      }
      await base.speak(text, language, options);
    },
    cancel: () => {
      base.cancel();
    },
    unlock: () => {
      base.unlock();
    },
    setRate: (rate) => {
      base.setRate(rate);
    },
  };
}
