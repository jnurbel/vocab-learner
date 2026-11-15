/**
 * Prints the version the built app shows: the version of package.json for a release, or the next
 * version as a beta for the commits made since the last release (src/domain/version/betaVersion.ts).
 *
 *   node scripts/version/printAppVersion.ts
 *
 * Needs the git history and the tags (actions/checkout with fetch-depth: 0). Without them, it
 * prints the version of package.json.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { betaVersion } from '../../src/domain/version/betaVersion.ts';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function latestTag(): string | undefined {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*').trim();
  } catch {
    return undefined;
  }
}

const tag = latestTag();
const commits =
  tag === undefined
    ? []
    : git('log', `${tag}..HEAD`, '--format=%B%x00')
        .split('\0')
        .map((message) => message.trim())
        .filter((message) => message !== '');

process.stdout.write(`${betaVersion(packageJson.version, tag, commits)}\n`);
