import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

import { shared } from '../../vitest.shared.ts';

// This package keeps a config of its own, against the general rule that packages inherit the root one. A config
// here replaces the root one rather than extending it, so it declares the shared layer alongside its own
// settings; without that the whole shared layer would be missing from every per-package run.
//
// The coverage entry extends the inherited `src`-only glob, which would otherwise leave the kit tree unmeasured. Kits
// are authored under `.readyup/` rather than `src/` because that is the directory that readyup itself reads. One glob
// covers the checks and the helpers alike, since `test-utils/` sits inside the tree that it serves; the inherited
// exclude drops the `__tests__/` directories that the same glob would otherwise sweep in. The text reporter shows no
// `test-utils` group; those files are in the coverage data regardless.
export default defineVitestConfig(shared, {
  root: {
    test: {
      coverage: {
        include: ['.readyup/kits/**/*.ts'],
      },
    },
  },
});
