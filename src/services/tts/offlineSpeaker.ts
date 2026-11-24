import type { Language } from '../../domain/card';
import type { Speaker, SpeechLanguage, VoiceCatalog, VoiceReport } from './speaker';

/** The voice chosen for the language goes through the Internet, and the device is offline. */
export class VoiceOfflineError extends Error {
  constructor(language: SpeechLanguage) {
    super(`The ${language} voice needs the network, and the device is offline`);
    this.name = 'VoiceOfflineError';
  }
}

/** The languages of the words, those the offline banner tells about. */
const WORD_LANGUAGES: readonly Language[] = ['zh', 'en'];

/**
 * The languages of the words whose chosen voice is an online one (Edge "Natural", Chrome "Google"):
 * they are silent without a network. A voice that does not tell is taken as local.
 */
export function onlineOnlyLanguages(report: VoiceReport): Language[] {
  return WORD_LANGUAGES.filter((language) => report.chosen[language]?.localService === false);
}

/**
 * Offline, an online voice is treated as missing: the screens show the word written instead
 * of waiting for a reading that never comes.
 */
export function offlineAwareSpeaker(
  base: Speaker & VoiceCatalog,
  isOnline: () => boolean,
): Speaker & VoiceCatalog {
  async function silentOffline(language: SpeechLanguage): Promise<boolean> {
    if (isOnline()) {
      return false;
    }
    return (await base.voiceReport()).chosen[language]?.localService === false;
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
