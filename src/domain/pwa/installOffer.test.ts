import { describe, expect, it } from 'vitest';
import { installOffer, isIosDevice } from './installOffer';

describe('installOffer', () => {
  it('offers the browser prompt when the browser kept one', () => {
    expect(installOffer({ installed: false, promptAvailable: true, ios: false })).toBe('prompt');
  });

  it('offers nothing once the app is installed, even with a prompt left', () => {
    expect(installOffer({ installed: true, promptAvailable: true, ios: false })).toBe('none');
    expect(installOffer({ installed: true, promptAvailable: false, ios: true })).toBe('none');
  });

  it('shows the written steps on iOS, which has no install prompt', () => {
    expect(installOffer({ installed: false, promptAvailable: false, ios: true })).toBe('iosHelp');
  });

  it('offers nothing in a browser that cannot install, such as Firefox on a computer', () => {
    expect(installOffer({ installed: false, promptAvailable: false, ios: false })).toBe('none');
  });
});

describe('isIosDevice', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

  it('recognises an iPhone', () => {
    expect(isIosDevice({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
  });

  it('recognises an iPad that presents itself as a Mac, by its touch screen', () => {
    expect(isIosDevice({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
  });

  it('does not take a Mac or an Android phone for iOS', () => {
    expect(isIosDevice({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
    expect(isIosDevice({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });
});
