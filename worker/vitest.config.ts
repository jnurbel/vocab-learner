import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: {
        // The Worker guards a paid API and children's photos: every line and branch is tested.
        'src/**': {
          100: true,
          perFile: true,
        },
      },
    },
  },
});
