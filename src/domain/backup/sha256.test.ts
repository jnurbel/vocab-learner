import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256With } from './sha256';

const sha256 = sha256With(webcrypto.subtle);

describe('sha256With', () => {
  it('gives the standard hexadecimal SHA-256 fingerprint of a text', async () => {
    expect(await sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('fingerprints the UTF-8 bytes of the text, hanzi included', async () => {
    expect(await sha256('猫')).toBe(
      'a810bf845a307382118e6e6aef21a79f6a26b1b3ad2225fe97b7ee4c125e3380',
    );
  });
});
