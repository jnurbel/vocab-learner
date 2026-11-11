import { describe, expect, it, vi } from 'vitest';
import {
  appUpdatesFrom,
  noAppUpdates,
  UPDATE_CHECK_INTERVAL_MS,
  type RegisterServiceWorker,
} from './appUpdates';

function fakeRegister() {
  const update = vi.fn(() => Promise.resolve());
  let options: Parameters<RegisterServiceWorker>[0] = {};
  const register: RegisterServiceWorker = (given) => {
    options = given;
    return update;
  };
  return { register, update, options: () => options };
}

describe('appUpdatesFrom', () => {
  it('tells the listeners when a new version waits', () => {
    const fake = fakeRegister();
    const updates = appUpdatesFrom(fake.register, { every: vi.fn() });
    const listener = vi.fn();
    updates.onUpdateReady(listener);

    fake.options().onNeedRefresh?.();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tells a listener at once when a new version already waits', () => {
    const fake = fakeRegister();
    const updates = appUpdatesFrom(fake.register, { every: vi.fn() });
    fake.options().onNeedRefresh?.();
    const listener = vi.fn();

    updates.onUpdateReady(listener);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('lets the new version take over only when asked', async () => {
    const fake = fakeRegister();
    const updates = appUpdatesFrom(fake.register, { every: vi.fn() });
    expect(fake.update).not.toHaveBeenCalled();

    await updates.applyUpdate();

    expect(fake.update).toHaveBeenCalledWith(true);
  });

  it('looks for a new version every hour, and ignores a failed check', async () => {
    const fake = fakeRegister();
    const every = vi.fn();
    appUpdatesFrom(fake.register, { every });
    const registration = { update: vi.fn(() => Promise.reject(new Error('offline'))) };

    fake.options().onRegisteredSW?.('/vocab-learner/sw.js', registration);
    const [check, interval] = every.mock.calls[0] as [() => void, number];
    check();
    await Promise.resolve();

    expect(interval).toBe(UPDATE_CHECK_INTERVAL_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('checks nothing when the browser registered no service worker', () => {
    const fake = fakeRegister();
    const every = vi.fn();
    appUpdatesFrom(fake.register, { every });

    fake.options().onRegisteredSW?.('/vocab-learner/sw.js', undefined);

    expect(every).not.toHaveBeenCalled();
  });

  it('repeats the checks with setInterval by default', () => {
    vi.useFakeTimers();
    try {
      const fake = fakeRegister();
      appUpdatesFrom(fake.register);
      const registration = { update: vi.fn(() => Promise.resolve()) };
      fake.options().onRegisteredSW?.('/vocab-learner/sw.js', registration);

      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);

      expect(registration.update).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('noAppUpdates', () => {
  it('never tells of an update, and updating does nothing', async () => {
    const listener = vi.fn();

    noAppUpdates.onUpdateReady(listener);
    await noAppUpdates.applyUpdate();

    expect(listener).not.toHaveBeenCalled();
  });
});
