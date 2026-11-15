import { describe, expect, it } from 'vitest';
import { betaVersion } from './betaVersion';

describe('betaVersion', () => {
  it('announces the next minor version as a beta after a feature, before 1.0', () => {
    expect(betaVersion('0.10.0', 'v0.10.0', ['feat: add sentence games'])).toBe('0.11.0-beta');
  });

  it('announces the next patch version as a beta after fixes only', () => {
    expect(
      betaVersion('0.10.0', 'v0.10.0', ['fix: let the learner pick a photo', 'perf: read faster']),
    ).toBe('0.10.1-beta');
  });

  it('counts the reverts and the dependency updates as patches', () => {
    expect(betaVersion('1.2.3', 'v1.2.3', ['revert: undo the island'])).toBe('1.2.4-beta');
    expect(betaVersion('1.2.3', 'v1.2.3', ['deps: update zod'])).toBe('1.2.4-beta');
  });

  it('bumps the minor version for a breaking change before 1.0, as release-please does', () => {
    expect(betaVersion('0.10.0', 'v0.10.0', ['feat!: change the backup format'])).toBe(
      '0.11.0-beta',
    );
  });

  it('bumps the major version for a breaking change from 1.0', () => {
    expect(betaVersion('1.4.2', 'v1.4.2', ['refactor(storage)!: drop the old tables'])).toBe(
      '2.0.0-beta',
    );
    expect(
      betaVersion('1.4.2', 'v1.4.2', ['fix: read old files\n\nBREAKING CHANGE: v1 files are gone']),
    ).toBe('2.0.0-beta');
  });

  it('bumps the minor version for a feature from 1.0', () => {
    expect(betaVersion('1.4.2', 'v1.4.2', ['fix(ui): align', 'feat(path): add a step'])).toBe(
      '1.5.0-beta',
    );
  });

  it('keeps the version of a release: nothing since its tag', () => {
    expect(betaVersion('0.11.0', 'v0.11.0', [])).toBe('0.11.0');
  });

  it('keeps the version when nothing since the tag would make a release', () => {
    expect(
      betaVersion('0.11.0', 'v0.11.0', [
        'docs: explain the path',
        'chore: back-merge master',
        'Merge pull request #70 from jnurbel/docs-path',
      ]),
    ).toBe('0.11.0');
  });

  it('keeps the version of a release being published, whose tag does not exist yet', () => {
    expect(betaVersion('0.11.0', 'v0.10.0', ['chore(master): release 0.11.0', 'feat: x'])).toBe(
      '0.11.0',
    );
  });

  it('keeps the version without any tag to compare with', () => {
    expect(betaVersion('0.1.0', undefined, ['feat: first'])).toBe('0.1.0');
  });

  it('ignores the messages that are not Conventional Commits', () => {
    expect(
      betaVersion('0.11.0', 'v0.11.0', ['feat(open: no closing parenthesis', 'my feat: words']),
    ).toBe('0.11.0');
  });

  it('keeps a version that is not plain MAJOR.MINOR.PATCH', () => {
    expect(betaVersion('1.0.0-rc.1', 'v1.0.0-rc.1', ['feat: x'])).toBe('1.0.0-rc.1');
  });
});
