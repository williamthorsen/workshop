import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './config/vitest.config.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
delete baseConfig.test?.coverage?.include;
/* eslint-enable @typescript-eslint/no-unsafe-member-access */

const config = defineConfig({
  test: {
    coverage: {
      include: [],
    },
    exclude: ['packages/**'],
    // The root carries no tests of its own. Confined to this config, which only `root:test` loads,
    // so a package that loses its whole suite still fails.
    passWithNoTests: true,
  },
});

export default mergeConfig(baseConfig, config);
