import { vi } from 'vitest';
import type { SpeechHost, SynthesisLike, UtteranceLike, VoiceLike } from './speaker';

/** Test helpers that mimic the speech synthesis of a phone browser. */

export const voice = (lang: string, name = lang): VoiceLike => ({ lang, name });

export class FakeUtterance implements UtteranceLike {
  lang = '';
  rate = 1;
  voice: VoiceLike | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(readonly text: string) {}
}

export interface FakeSpeechOptions {
  /** Voices returned at first; Chrome returns none and announces them later. */
  voices?: VoiceLike[];
  /** Voices delivered by `deliverLateVoices`, with a `voiceschanged` event. */
  lateVoices?: VoiceLike[];
  /**
   * iOS Safari (and Chrome Android): until one utterance was spoken during a user gesture,
   * every `speak()` is dropped silently, without any error.
   */
  requireGesture?: boolean;
  /** Safari drops an utterance spoken right after `cancel()`, within this many ms. */
  cancelSettleMs?: number;
}

/**
 * A fake `speechSynthesis` that behaves like a phone's: utterances queue up and end only when
 * the test says so, and speech may need a user gesture to start.
 */
export function fakeSpeech({
  voices: initialVoices = [],
  lateVoices = [],
  requireGesture = false,
  cancelSettleMs = 0,
}: FakeSpeechOptions = {}) {
  let voices = initialVoices;
  let inGesture = false;
  let activated = !requireGesture;
  let lastCancelAt = Number.NEGATIVE_INFINITY;
  const listeners: (() => void)[] = [];
  /** Every utterance the browser accepted, in order. */
  const spoken: FakeUtterance[] = [];
  /** Accepted and not ended yet: the first one is being spoken, the others wait. */
  const queue: FakeUtterance[] = [];
  /** Utterances dropped without a word, as mobile browsers do. */
  const dropped: FakeUtterance[] = [];

  const synthesis = {
    get speaking() {
      return queue.length > 0;
    },
    get pending() {
      return queue.length > 1;
    },
    getVoices: () => voices,
    addEventListener: (_type: 'voiceschanged', listener: () => void) => {
      listeners.push(listener);
    },
    removeEventListener: vi.fn(),
    speak: vi.fn((utterance: FakeUtterance) => {
      const tooSoonAfterCancel = Date.now() - lastCancelAt < cancelSettleMs;
      if ((!activated && !inGesture) || tooSoonAfterCancel) {
        dropped.push(utterance);
        return;
      }
      activated = true;
      spoken.push(utterance);
      queue.push(utterance);
    }),
    cancel: vi.fn(() => {
      lastCancelAt = Date.now();
      for (const utterance of queue.splice(0)) {
        utterance.onerror?.({ error: 'interrupted' });
      }
    }),
    resume: vi.fn(),
  } satisfies SynthesisLike & Record<string, unknown>;

  const host: SpeechHost = {
    speechSynthesis: synthesis,
    createUtterance: (text) => new FakeUtterance(text),
  };

  return {
    host,
    synthesis,
    spoken,
    dropped,
    /** The words actually heard: the blank unlocking utterance is silent. */
    get heard(): string[] {
      return spoken.map(({ text }) => text).filter((text) => text.trim() !== '');
    },
    /** Runs `action` as the handler of a click or key press, i.e. during a user gesture. */
    gesture: (action: () => void) => {
      inGesture = true;
      try {
        action();
      } finally {
        inGesture = false;
      }
    },
    /** Ends the utterance being spoken, as the browser's `onend` would. */
    endCurrent: () => {
      queue.shift()?.onend?.();
    },
    deliverLateVoices: () => {
      voices = lateVoices;
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
}
