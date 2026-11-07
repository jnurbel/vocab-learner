import type { Language } from '../../domain/card';

/** Reads words aloud; injected so that tests and browsers without voices can do without. */
export interface Speaker {
  /** Whether a voice exists for the language; the first call waits for the voice list. */
  hasVoice(language: Language): Promise<boolean>;
  /**
   * Resolves once the word was read (at the end of the utterance, which is how iOS chains
   * readings); rejects when it cannot be read: no voice, error, or a SpeechBlockedError when
   * the browser refused to speak without a user gesture.
   */
  speak(text: string, language: Language, options?: SpeakOptions): Promise<void>;
  cancel(): void;
  /**
   * Lets the browser speak: iOS Safari and Chrome Android only start speech from a user
   * gesture, and silently drop a reading started after an `await`. Must be called
   * synchronously in the handler of every click or key press that starts audio.
   */
  unlock(): void;
}

export interface SpeakOptions {
  /** Speech rate of this reading, e.g. 0.5 to read slowly; the speaker's own rate otherwise. */
  rate?: number;
}

/** The browser refused to speak (`not-allowed`): a user gesture must unlock the speech. */
export class SpeechBlockedError extends Error {
  constructor() {
    super('Speech not allowed before a user gesture');
    this.name = 'SpeechBlockedError';
  }
}

export function isSpeechBlocked(error: unknown): error is SpeechBlockedError {
  return error instanceof SpeechBlockedError;
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
  /** Optional: absent from some test doubles; always there in browsers. */
  readonly speaking?: boolean;
  readonly pending?: boolean;
  getVoices(): readonly VoiceLike[];
  addEventListener(type: 'voiceschanged', listener: () => void): void;
  removeEventListener(type: 'voiceschanged', listener: () => void): void;
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  resume?(): void;
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
  /**
   * Silence before each word: phones cut the start of a reading that follows another one,
   * and Safari loses a reading spoken right after `cancel()`.
   */
  leadInMs?: number;
}

/** Longest wait for the end of a reading, as Chrome Android sometimes never sends `onend`. */
const END_TIMEOUT_BASE_MS = 3_000;
const END_TIMEOUT_PER_CHAR_MS = 500;

const BCP47_OF: Record<Language, string> = { zh: 'zh-CN', en: 'en-GB' };

/** Errors raised when a reading is stopped on purpose, e.g. by the next word. */
const STOPPED = new Set(['interrupted', 'canceled']);

interface VoiceTag {
  language: string;
  script: string | undefined;
  region: string | undefined;
}

/** Parses tags as browsers write them: zh-CN, zh_CN, cmn-Hans-CN, or zh_CN_#Hans on Android. */
function tagOf(voice: VoiceLike): VoiceTag {
  const [language = '', ...subtags] = voice.lang
    .toLowerCase()
    .replaceAll('_', '-')
    .replaceAll('#', '')
    .split('-');
  return {
    language,
    script: subtags.find((subtag) => /^[a-z]{4}$/.test(subtag)),
    region: subtags.find((subtag) => /^(?:[a-z]{2}|\d{3})$/.test(subtag)),
  };
}

/**
 * How well a voice suits the language, the higher the better; undefined when it does not.
 * Chinese: mainland Mandarin (zh or cmn), never Cantonese (yue, zh-HK) nor traditional
 * Chinese (zh-TW, Hant). English: British, as taught in France, then any English.
 */
function scoreOf(voice: VoiceLike, language: Language): number | undefined {
  const { language: code, script, region } = tagOf(voice);
  if (language === 'en') {
    if (code !== 'en') {
      return undefined;
    }
    return region === 'gb' ? 2 : 1;
  }
  if ((code !== 'zh' && code !== 'cmn') || script === 'hant') {
    return undefined;
  }
  if (region === 'cn') {
    return 2;
  }
  return region === undefined ? 1 : undefined;
}

export function pickVoice(voices: readonly VoiceLike[], language: Language): VoiceLike | undefined {
  let best: { voice: VoiceLike; score: number } | undefined;
  for (const voice of voices) {
    const score = scoreOf(voice, language);
    if (score !== undefined && (best === undefined || score > best.score)) {
      best = { voice, score };
    }
  }
  return best?.voice;
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Speaker backed by the browser's speech synthesis (free, offline when the voice is local). */
export function createWebSpeechSpeaker(
  host: SpeechHost,
  { voicesTimeoutMs = 1_500, rate = 1, leadInMs = 300 }: SpeakerOptions = {},
): Speaker {
  const { speechSynthesis: synthesis, createUtterance } = host;
  let voices: Promise<readonly VoiceLike[]> | undefined;
  let unlocked = false;
  /** Bumped by every reading and by cancel(), so that a superseded reading stays silent. */
  let generation = 0;
  /** Kept referenced: Chrome may otherwise collect the utterance and never call `onend`. */
  let current: UtteranceLike | undefined;

  /** Chrome returns no voice at first and announces them with `voiceschanged`. */
  function loadVoices(available: SynthesisLike): Promise<readonly VoiceLike[]> {
    voices ??= new Promise<readonly VoiceLike[]>((resolve) => {
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
    }).then((loaded) => {
      // A phone may announce its voices late: an empty list is looked for again next time.
      if (loaded.length === 0) {
        voices = undefined;
      }
      return loaded;
    });
    return voices;
  }

  async function voiceFor(language: Language): Promise<VoiceLike | undefined> {
    return synthesis === undefined || createUtterance === undefined
      ? undefined
      : pickVoice(await loadVoices(synthesis), language);
  }

  function play(available: SynthesisLike, utterance: UtteranceLike, text: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const longest =
        (END_TIMEOUT_BASE_MS + END_TIMEOUT_PER_CHAR_MS * Array.from(text).length) / utterance.rate;
      const settle = (end: () => void) => {
        clearTimeout(watchdog);
        if (current === utterance) {
          current = undefined;
        }
        end();
      };
      // Chrome Android sometimes never ends a reading: the dictation must not stay stuck.
      const watchdog = setTimeout(() => {
        settle(resolve);
      }, longest);
      utterance.onend = () => {
        settle(resolve);
      };
      utterance.onerror = ({ error }) => {
        if (STOPPED.has(error)) {
          settle(resolve);
        } else if (error === 'not-allowed') {
          // The unlocking did not take: the next gesture tries again.
          unlocked = false;
          settle(() => {
            reject(new SpeechBlockedError());
          });
        } else {
          settle(() => {
            reject(new Error(`Speech failed: ${error}`));
          });
        }
      };
      current = utterance;
      // Chrome pauses the synthesis by itself after a while, and then reads nothing more.
      available.resume?.();
      available.speak(utterance);
    });
  }

  return {
    async hasVoice(language) {
      return (await voiceFor(language)) !== undefined;
    },
    async speak(text, language, options = {}) {
      generation += 1;
      const reading = generation;
      const voice = await voiceFor(language);
      if (voice === undefined || synthesis === undefined || createUtterance === undefined) {
        // Never read with a voice of another language: the screen shows the word instead.
        throw new Error(`No voice for ${language}`);
      }
      if (reading !== generation) {
        return;
      }
      // Cancelling when nothing is said is useless, and loses the next reading on Safari.
      if (synthesis.speaking === true || synthesis.pending === true) {
        synthesis.cancel();
      }
      await pause(leadInMs);
      if (reading !== generation) {
        return;
      }
      const utterance = createUtterance(text);
      utterance.voice = voice;
      utterance.lang = BCP47_OF[language];
      utterance.rate = options.rate ?? rate;
      await play(synthesis, utterance, text);
    },
    cancel() {
      generation += 1;
      synthesis?.cancel();
    },
    unlock() {
      if (synthesis === undefined || createUtterance === undefined) {
        return;
      }
      if (!unlocked) {
        unlocked = true;
        // A blank utterance at normal volume: Safari ignores some readings at volume 0.
        synthesis.speak(createUtterance(' '));
      }
      synthesis.resume?.();
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
