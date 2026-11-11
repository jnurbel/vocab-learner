import { config } from 'zod';
import { describe, expect, it } from 'vitest';
import './zodSetup';

describe('zodSetup', () => {
  it('validates without new Function(), which the strict CSP refuses', () => {
    expect(config().jitless).toBe(true);
  });
});
