import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// This is the ancestor config each package resolves by walking up from its own directory.
// Project roots default to the run root, so these globs scope to whichever package invoked Vitest.
// The repo's own root-level tests use `vitest.root.config.ts` instead.
export default defineVitestConfig();
