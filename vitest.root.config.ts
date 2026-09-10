import { defineRootVitestConfig } from '@williamthorsen/nmr/vitest';

import { shared } from './vitest.shared.ts';

// Vitest configuration for the monorepo's root-level tests, which exclude workspace tests.
export default defineRootVitestConfig(shared, { monorepoRoot: import.meta.dirname });
