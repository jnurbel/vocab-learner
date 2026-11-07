import type { SettingsRecord } from './progressRecords';

/**
 * Speech rates of the three speeds of the voice. Below the browsers' 1: a learner, on a phone
 * speaker, did not recognise the words read faster.
 */
export const SPEECH_RATES = { slow: 0.5, normal: 0.7, fast: 0.9 } as const;

export type SpeechSpeed = keyof typeof SPEECH_RATES;

export const SPEECH_SPEEDS: readonly SpeechSpeed[] = ['slow', 'normal', 'fast'];

export const DEFAULT_SPEECH_SPEED: SpeechSpeed = 'normal';

/** A slow replay reads at half the chosen rate, never below this rate. */
const SLOW_FACTOR = 0.5;
const MIN_RATE = 0.4;

export function isSpeechRate(value: unknown): value is number {
  return SPEECH_SPEEDS.some((speed) => SPEECH_RATES[speed] === value);
}

/** The speed chosen in the settings; a stored rate of no speed gives the default. */
export function speechSpeedOf(settings: SettingsRecord | undefined): SpeechSpeed {
  const rate = settings?.ttsRate;
  return SPEECH_SPEEDS.find((speed) => SPEECH_RATES[speed] === rate) ?? DEFAULT_SPEECH_SPEED;
}

/** The rate of a slow replay of a word read at `rate`. */
export function slowRateOf(rate: number): number {
  return Math.max(MIN_RATE, Math.round(rate * SLOW_FACTOR * 100) / 100);
}
