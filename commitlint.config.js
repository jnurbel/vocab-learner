/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot bodies contain long release-note lines that break body-max-line-length.
  ignores: [(message) => message.includes('Signed-off-by: dependabot[bot]')],
};
