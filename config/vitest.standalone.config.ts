import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.js';
import { integrationTestPatterns } from './vitest.integration.config.js';

const config = defineConfig({
  test: {
    exclude: integrationTestPatterns,
  },
});

export default mergeConfig(baseConfig, config);
