import { defineConfig, mergeConfig } from 'vitest/config';

export const baseConfig = defineConfig({
  test: {
    coverage: {
      enabled: false, // don't check coverage unless the `--coverage` flag is passed
      exclude: [
        '**/__{mocks,tests}__/*', //
        '**/index.ts',
        '**/mock*.{ts,tsx}',
        '**/*.d.ts',
        '**/*.types.ts',
      ],
      include: ['**/src/**/*.{ts,tsx}'],
      provider: 'v8',
    },
    exclude: ['**/node_modules/**'],
    watch: false, // don't enter watch mode unless the `--watch` flag is passed
  },
});

const config = defineConfig({
  test: {
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
  },
});

export default mergeConfig(baseConfig, config);
