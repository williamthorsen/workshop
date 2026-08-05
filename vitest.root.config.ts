import { defineRootVitestConfig } from '@williamthorsen/nmr/vitest';

// Vitest configuration for the monorepo's root-level tests, which exclude workspace tests.
export default defineRootVitestConfig({ monorepoRoot: import.meta.dirname });
