import { describe, expect, it, vi } from 'vitest';
import { watchInstall, type InstallHost } from './installPrompt';

const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

interface HostOptions {
  userAgent?: string;
  standalone?: boolean;
  displayMode?: boolean;
}

function fakeHost({ userAgent = ANDROID, standalone, displayMode }: HostOptions = {}) {
  const target = new EventTarget();
  const host: InstallHost = {
    addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      target.addEventListener(type, listener);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      target.removeEventListener(type, listener);
    }),
    navigator: {
      userAgent,
      maxTouchPoints: 5,
      ...(standalone === undefined ? {} : { standalone }),
    },
    ...(displayMode === undefined ? {} : { matchMedia: () => ({ matches: displayMode }) }),
  };
  return { host, target };
}

function promptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
}

const state = (installed: boolean, promptAvailable: boolean, ios = false) => ({
  installed,
  promptAvailable,
  ios,
});

describe('watchInstall', () => {
  it('reports at once that nothing can be installed yet', () => {
    const { host } = fakeHost({ displayMode: false });
    const onChange = vi.fn();

    watchInstall(host, onChange, vi.fn());

    expect(onChange).toHaveBeenCalledWith(state(false, false));
  });

  it('keeps the prompt of the browser instead of letting it show its own', () => {
    const { host, target } = fakeHost();
    const onChange = vi.fn();
    watchInstall(host, onChange, vi.fn());
    const event = promptEvent('accepted');

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(state(false, true));
  });

  it('shows the kept prompt on install, only once, and tells the choice', async () => {
    const { host, target } = fakeHost();
    const onChange = vi.fn();
    const watch = watchInstall(host, onChange, vi.fn());
    const event = promptEvent('dismissed');
    target.dispatchEvent(event);

    expect(await watch.install()).toBe('dismissed');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(state(false, false));
    expect(await watch.install()).toBe('unavailable');
  });

  it('reports the installation and tells it once installed', () => {
    const { host, target } = fakeHost();
    const onChange = vi.fn();
    const onInstalled = vi.fn();
    watchInstall(host, onChange, onInstalled);
    target.dispatchEvent(promptEvent('accepted'));

    target.dispatchEvent(new Event('appinstalled'));

    expect(onChange).toHaveBeenLastCalledWith(state(true, false));
    expect(onInstalled).toHaveBeenCalledTimes(1);
  });

  it('knows an app opened from the home screen of an iPhone, and that it runs installed', () => {
    const { host } = fakeHost({ userAgent: IPHONE, standalone: true });
    const onChange = vi.fn();
    const onInstalled = vi.fn();

    watchInstall(host, onChange, onInstalled);

    expect(onChange).toHaveBeenCalledWith(state(true, false, true));
    expect(onInstalled).toHaveBeenCalledTimes(1);
  });

  it('knows an app open in its own window', () => {
    const { host } = fakeHost({ displayMode: true });
    const onChange = vi.fn();

    watchInstall(host, onChange, vi.fn());

    expect(onChange).toHaveBeenCalledWith(state(true, false));
  });

  it('stops listening once stopped', () => {
    const { host, target } = fakeHost();
    const onChange = vi.fn();
    const watch = watchInstall(host, onChange, vi.fn());

    watch.stop();
    target.dispatchEvent(promptEvent('accepted'));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
