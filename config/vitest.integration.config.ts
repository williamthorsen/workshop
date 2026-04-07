import { defineConfig, mergeConfig } from 'vitest/config';

import { baseConfig } from './vitest.config.js';

export const integrationTestPatterns = ['**/__tests__/**/*.int.test.{ts,tsx}'];

const config = defineConfig({
  test: {
    include: integrationTestPatterns,
  },
});

export default mergeConfig(baseConfig, config);
