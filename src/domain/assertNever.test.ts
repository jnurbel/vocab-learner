import { describe, expect, it } from 'vitest';
import { assertNever } from './assertNever';

describe('assertNever', () => {
  it('throws an error that names the unexpected value', () => {
    expect(() => assertNever('unexpected' as never)).toThrow('Unexpected value: "unexpected"');
  });
});
