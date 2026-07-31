import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// The package factory, not the root one. Setting no `root` and no workspace exclusions lets a run started at the repo
// root sweep the whole tree, which is what root `test:watch` expects. `vitest.root.config.ts` is the scoped config.
export default defineVitestConfig();
