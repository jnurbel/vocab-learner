import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
import { appVersion } from './appVersion';

describe('appVersion', () => {
  it('is the version of package.json, written into backups', () => {
    expect(appVersion).toBe(packageJson.version);
  });
});
