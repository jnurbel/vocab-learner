import { vi } from 'vitest';
import type { Language } from '../../domain/card';
import type { SpeakOptions, Speaker } from '../../services/tts/speaker';

/** Test helpers shared by the dictation tests. */

export interface Reading {
  text: string;
  language: Language;
  rate: number | undefined;
  /** Ends the utterance, as the browser's `onend` would. */
  end: () => void;
  fail: () => void;
}

/** A speaker whose readings end only when the test says so. */
export class FakeSpeaker implements Speaker {
  readonly readings: Reading[] = [];
  voice = true;
  readonly cancel = vi.fn(() => {
    // A cancelled reading resolves quietly, like an interrupted utterance.
    for (const reading of this.readings) {
      reading.end();
    }
  });

  hasVoice(): Promise<boolean> {
    return Promise.resolve(this.voice);
  }

  speak(text: string, language: Language, options: SpeakOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      this.readings.push({
        text,
        language,
        rate: options.rate,
        end: resolve,
        fail: () => {
          reject(new Error('Speech failed'));
        },
      });
    });
  }

  get texts(): string[] {
    return this.readings.map(({ text }) => text);
  }

  last(): Reading {
    const reading = this.readings.at(-1);
    if (reading === undefined) {
      throw new Error('Nothing was read');
    }
    return reading;
  }
}
