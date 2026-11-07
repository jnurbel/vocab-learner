import { describe, expect, it } from 'vitest';
import { belongsToInputMethod } from './imeKeys';

/** `legacyCode`: the deprecated key code some browsers still send during a composition. */
const key = (init: KeyboardEventInit, legacyCode?: number) => {
  const event = new KeyboardEvent('keydown', init);
  if (legacyCode !== undefined) {
    Object.defineProperty(event, 'keyCode', { value: legacyCode });
  }
  return event;
};

describe('belongsToInputMethod', () => {
  it('leaves a plain Enter to the answer field', () => {
    expect(belongsToInputMethod(key({ key: 'Enter' }), false)).toBe(false);
  });

  it('gives every key to the input method between compositionstart and compositionend', () => {
    expect(belongsToInputMethod(key({ key: 'Enter' }), true)).toBe(true);
  });

  it('gives a key the browser marks as composing to the input method', () => {
    expect(belongsToInputMethod(key({ key: 'Enter', isComposing: true }), false)).toBe(true);
  });

  it('gives the Enter that Safari sends after compositionend, with key code 229, to the input method', () => {
    expect(belongsToInputMethod(key({ key: 'Enter' }, 229), false)).toBe(true);
  });
});
