// vitest.root.config.ts
import { defineRootVitestConfig } from '@williamthorsen/nmr/vitest';

// `Pin the monorepo root to this file's directory, so workspace exclusions hold wherever the run is invoked from.
export default defineRootVitestConfig({ monorepoRoot: import.meta.dirname });
