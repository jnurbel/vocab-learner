import { describe, expect, it, vi } from 'vitest';
import type { ImageSize } from '../../domain/photo/imageSize';
import { PHOTO_MAX_BYTES, preparePhoto, type PhotoEnvironment } from './preparePhoto';

function fakeEnvironment(size: ImageSize, options: { unreadable?: boolean } = {}) {
  const drawn: ImageSize[] = [];
  const close = vi.fn();
  const decode = vi.fn(() =>
    options.unreadable === true
      ? Promise.reject(new Error('cannot decode'))
      : Promise.resolve({ ...size, close }),
  );
  const environment: PhotoEnvironment = {
    decode,
    redraw: vi.fn((_image, target: ImageSize) => {
      drawn.push(target);
      return Promise.resolve(new Blob(['pixels only'], { type: 'image/jpeg' }));
    }),
  };
  return { environment, decode, drawn, close };
}

const photo = (type = 'image/jpeg', size = 10) => new Blob(['x'.repeat(size)], { type });

describe('preparePhoto', () => {
  it('redraws the photo reduced to 1 500 pixels, so that only its pixels are kept', async () => {
    const { environment, drawn } = fakeEnvironment({ width: 4000, height: 3000 });

    const prepared = await preparePhoto(photo(), environment);

    expect(drawn).toEqual([{ width: 1500, height: 1125 }]);
    expect(prepared.ok && (await prepared.value.text())).toBe('pixels only');
  });

  it('releases the decoded image once redrawn', async () => {
    const { environment, close } = fakeEnvironment({ width: 100, height: 100 });

    await preparePhoto(photo(), environment);

    expect(close).toHaveBeenCalledOnce();
  });

  it('refuses a file that is not an image, without reading it', async () => {
    const { environment, decode } = fakeEnvironment({ width: 100, height: 100 });

    expect(await preparePhoto(photo('text/html'), environment)).toEqual({
      ok: false,
      errors: ['notAnImage'],
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it('refuses a file larger than the limit, without reading it', async () => {
    const { environment, decode } = fakeEnvironment({ width: 100, height: 100 });

    expect(await preparePhoto(photo('image/png', PHOTO_MAX_BYTES + 1), environment)).toEqual({
      ok: false,
      errors: ['tooLarge'],
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it('reports an image that the browser cannot read', async () => {
    const { environment } = fakeEnvironment({ width: 100, height: 100 }, { unreadable: true });

    expect(await preparePhoto(photo(), environment)).toEqual({ ok: false, errors: ['unreadable'] });
  });
});
