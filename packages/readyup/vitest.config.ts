import { defineConfig, mergeConfig } from 'vitest/config';

import { baseConfig } from '../../.config/vitest/vitest.config.ts';

const config = defineConfig({
  test: {
    // Pinning the style keeps rendering deterministic: left to detection, output would follow whether the
    // runner attached a terminal and whether CI was set, so the same assertion would pass locally and fail
    // on the runner. A test wanting plain output passes `--style plain`, which outranks this.
    env: {
      RDY_STYLE: 'rich',
    },
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
  },
});

export default mergeConfig(baseConfig, config);
