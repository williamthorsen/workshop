import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

import { sharedOptions } from './vitest.shared.ts';

// This is the config that `nmr-vitest` names for a package that lacks its own, and the config that
// `nmr test:watch` resolves when it collects the whole tree in one process.
// Project roots default to the run root, so these globs scope to whichever package invoked Vitest.
// The repo's own root-level tests use `vitest.root.config.ts` instead.
export default defineVitestConfig(sharedOptions);
