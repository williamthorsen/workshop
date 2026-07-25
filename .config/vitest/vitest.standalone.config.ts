import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.ts';
import { integrationTestPatterns } from './vitest.integration.config.ts';

const config = defineConfig({
  test: {
    exclude: integrationTestPatterns,
  },
});

export default mergeConfig(baseConfig, config);
