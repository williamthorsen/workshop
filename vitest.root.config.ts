import { defineRootVitestConfig } from '@williamthorsen/nmr/vitest';

import { sharedOptions } from './vitest.shared.ts';

// Vitest configuration for the monorepo's root-level tests, which exclude workspace tests.
export default defineRootVitestConfig(sharedOptions, { monorepoRoot: import.meta.dirname });
