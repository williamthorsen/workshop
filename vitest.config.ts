import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

import { shared } from './vitest.shared.ts';

// This is the ancestor config a package resolves by walking up from its own directory, and the config
// `nmr test:watch` resolves when it collects the whole tree in one process.
// Project roots default to the run root, so these globs scope to whichever package invoked Vitest.
// The repo's own root-level tests use `vitest.root.config.ts` instead.
export default defineVitestConfig(shared);
