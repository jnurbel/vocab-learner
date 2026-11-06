import { describe, expect, it, vi } from 'vitest';
import { lazyLoader } from './lazyLoader';

describe('lazyLoader', () => {
  it('loads nothing until it is first asked', () => {
    const load = vi.fn(() => Promise.resolve('module'));

    lazyLoader(load);

    expect(load).not.toHaveBeenCalled();
  });

  it('loads once and shares the result between callers', async () => {
    const load = vi.fn(() => Promise.resolve('module'));
    const get = lazyLoader(load);

    const [first, second] = await Promise.all([get(), get()]);

    expect([first, second, await get()]).toEqual(['module', 'module', 'module']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('tries again on the next call after a failed load', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('module');
    const get = lazyLoader(load);

    await expect(get()).rejects.toThrow('offline');
    await expect(get()).resolves.toBe('module');
  });
});
