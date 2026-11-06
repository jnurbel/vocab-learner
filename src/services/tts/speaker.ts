import type { Language } from '../../domain/card';

/** Reads words aloud; injected so that tests and browsers without voices can do without. */
export interface Speaker {
  /** Whether a voice exists for the language; the first call waits for the voice list. */
  hasVoice(language: Language): Promise<boolean>;
  /** Resolves once the word was read; rejects when it cannot be read (no voice, error). */
  speak(text: string, language: Language): Promise<void>;
  cancel(): void;
}

/** The parts of the Web Speech API used here. */
export interface VoiceLike {
  readonly lang: string;
  readonly name: string;
}

export interface UtteranceLike {
  lang: string;
  rate: number;
  voice: VoiceLike | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

export interface SynthesisLike {
  getVoices(): readonly VoiceLike[];
  addEventListener(type: 'voiceschanged', listener: () => void): void;
  removeEventListener(type: 'voiceschanged', listener: () => void): void;
  speak(utterance: UtteranceLike): void;
  cancel(): void;
}

export interface SpeechHost {
  /** Absent in browsers without speech synthesis. */
  speechSynthesis?: SynthesisLike;
  createUtterance?: (text: string) => UtteranceLike;
}

export interface SpeakerOptions {
  /** How long to wait for a voice list that the browser loads late. */
  voicesTimeoutMs?: number;
  rate?: number;
}

/** Voice languages tried in order: mainland Mandarin; British English, as taught in France. */
const PREFERRED_LANGS: Record<Language, readonly string[]> = {
  zh: ['zh-cn'],
  en: ['en-gb', 'en'],
};

const BCP47_OF: Record<Language, string> = { zh: 'zh-CN', en: 'en-GB' };

/** Errors raised when a reading is stopped on purpose, e.g. by the next word. */
const STOPPED = new Set(['interrupted', 'canceled']);

const normalizedLang = (voice: VoiceLike) => voice.lang.replace('_', '-').toLowerCase();

export function pickVoice(voices: readonly VoiceLike[], language: Language): VoiceLike | undefined {
  for (const wanted of PREFERRED_LANGS[language]) {
    const found = voices.find((voice) => {
      const lang = normalizedLang(voice);
      return lang === wanted || (!wanted.includes('-') && lang.startsWith(`${wanted}-`));
    });
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Speaker backed by the browser's speech synthesis (free, offline when the voice is local). */
export function createWebSpeechSpeaker(
  host: SpeechHost,
  { voicesTimeoutMs = 1_500, rate = 1 }: SpeakerOptions = {},
): Speaker {
  const { speechSynthesis: synthesis, createUtterance } = host;
  let voices: Promise<readonly VoiceLike[]> | undefined;

  /** Chrome returns no voice at first and announces them with `voiceschanged`. */
  function loadVoices(available: SynthesisLike): Promise<readonly VoiceLike[]> {
    voices ??= new Promise((resolve) => {
      const now = available.getVoices();
      if (now.length > 0) {
        resolve(now);
        return;
      }
      const done = () => {
        clearTimeout(timer);
        available.removeEventListener('voiceschanged', done);
        resolve(available.getVoices());
      };
      const timer = setTimeout(done, voicesTimeoutMs);
      available.addEventListener('voiceschanged', done);
    });
    return voices;
  }

  async function voiceFor(language: Language): Promise<VoiceLike | undefined> {
    return synthesis === undefined || createUtterance === undefined
      ? undefined
      : pickVoice(await loadVoices(synthesis), language);
  }

  return {
    async hasVoice(language) {
      return (await voiceFor(language)) !== undefined;
    },
    async speak(text, language) {
      const voice = await voiceFor(language);
      if (voice === undefined || synthesis === undefined || createUtterance === undefined) {
        throw new Error(`No voice for ${language}`);
      }
      synthesis.cancel();
      const utterance = createUtterance(text);
      utterance.voice = voice;
      utterance.lang = BCP47_OF[language];
      utterance.rate = rate;
      await new Promise<void>((resolve, reject) => {
        utterance.onend = () => {
          resolve();
        };
        utterance.onerror = ({ error }) => {
          if (STOPPED.has(error)) {
            resolve();
          } else {
            reject(new Error(`Speech failed: ${error}`));
          }
        };
        synthesis.speak(utterance);
      });
    },
    cancel() {
      synthesis?.cancel();
    },
  };
}

/** The browser's speech synthesis, when it has one. */
export function browserSpeechHost(): SpeechHost {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
    return {};
  }
  return {
    speechSynthesis: speechSynthesis as unknown as SynthesisLike,
    createUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
  };
}
