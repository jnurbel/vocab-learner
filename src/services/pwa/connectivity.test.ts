import { describe, expect, it, vi } from 'vitest';
import { watchConnectivity } from './connectivity';

function fakeHost(onLine: boolean) {
  const target = new EventTarget();
  const host = {
    navigator: { onLine },
    addEventListener: vi.fn((type: string, listener: () => void) => {
      target.addEventListener(type, listener);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      target.removeEventListener(type, listener);
    }),
  };
  const go = (online: boolean) => {
    host.navigator.onLine = online;
    target.dispatchEvent(new Event(online ? 'online' : 'offline'));
  };
  return { host, go };
}

describe('watchConnectivity', () => {
  it('reports the state at once', () => {
    const { host } = fakeHost(false);
    const onChange = vi.fn();

    watchConnectivity(host, onChange);

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('reports the loss and the return of the network', () => {
    const { host, go } = fakeHost(true);
    const onChange = vi.fn();
    watchConnectivity(host, onChange);

    go(false);
    go(true);

    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('stops reporting once stopped', () => {
    const { host, go } = fakeHost(true);
    const onChange = vi.fn();
    const stop = watchConnectivity(host, onChange);

    stop();
    go(false);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(host.removeEventListener).toHaveBeenCalledTimes(2);
  });
});
