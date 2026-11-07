import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPEECH_SPEED,
  isSpeechRate,
  SPEECH_RATES,
  SPEECH_SPEEDS,
  slowRateOf,
  speechSpeedOf,
} from './speechRate';

describe('the speeds of the voice', () => {
  it('reads slowly enough for a learner to recognise the words', () => {
    expect(SPEECH_RATES).toEqual({ slow: 0.5, normal: 0.7, fast: 0.9 });
    expect(SPEECH_SPEEDS).toEqual(['slow', 'normal', 'fast']);
    expect(DEFAULT_SPEECH_SPEED).toBe('normal');
  });

  it('accepts only the rates of the three speeds', () => {
    expect([0.5, 0.7, 0.9].every(isSpeechRate)).toBe(true);
    for (const rate of [0, 0.6, 1, 0.85, Number.NaN, '0.7', undefined]) {
      expect(isSpeechRate(rate)).toBe(false);
    }
  });
});

describe('speechSpeedOf', () => {
  it('reads at the normal speed when the learner never chose another', () => {
    expect(speechSpeedOf(undefined)).toBe('normal');
    expect(speechSpeedOf({})).toBe('normal');
  });

  it('follows the speed chosen in the settings', () => {
    expect(speechSpeedOf({ ttsRate: 0.5 })).toBe('slow');
    expect(speechSpeedOf({ ttsRate: 0.9 })).toBe('fast');
  });

  it('falls back to normal for a stored rate of no speed, e.g. 1 from an old backup', () => {
    expect(speechSpeedOf({ ttsRate: 1 })).toBe('normal');
    expect(speechSpeedOf({ ttsRate: 0.85 })).toBe('normal');
  });
});

describe('slowRateOf', () => {
  it('reads a slow replay at half the chosen rate', () => {
    expect(slowRateOf(0.9)).toBe(0.45);
    expect(slowRateOf(1)).toBe(0.5);
  });

  it('never reads slower than 0.4, which would distort the word', () => {
    expect(slowRateOf(0.7)).toBe(0.4);
    expect(slowRateOf(0.5)).toBe(0.4);
  });
});
