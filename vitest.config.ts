import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// The package factory, not the root one. This config sets no `root` and no workspace exclusions, so a run started at
// the repo root sweeps the whole tree, which is what root `test:watch` expects. `vitest.root.config.ts` is the scoped
// one; the asymmetry is deliberate.
export default defineVitestConfig();
