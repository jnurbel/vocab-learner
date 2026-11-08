import { vi } from 'vitest';
import type { Speaker } from '../../services/tts/speaker';

/** A speaker that reads nothing, and tells whether a voice exists; unlock and setRate included. */
export function fakeSpeaker(withVoice = true) {
  return {
    hasVoice: vi.fn<Speaker['hasVoice']>(() => Promise.resolve(withVoice)),
    speak: vi.fn<Speaker['speak']>(() => Promise.resolve()),
    cancel: vi.fn(),
    unlock: vi.fn(),
    setRate: vi.fn(),
  } satisfies Speaker;
}
