import path from 'node:path';

import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// This package keeps a config of its own, against the general rule that packages inherit the root one. The rule
// targets configs that merely restate the shared config; this one holds package-scoped settings that have no
// root-level expression, since a `project` override at the root would apply to every package.
//
// Pinning the style keeps rendering deterministic: left to detection, output would follow whether the runner attached
// a terminal and whether CI was set, so the same assertion would pass locally and fail on the runner. A test wanting
// plain output passes `--style plain`, which outranks this.
//
// Restoring a stubbed environment variable is the runner's job rather than a suite's. `unstubEnvs` clears every stub
// before each test, so a suite that stubs one has no hook to undo it.
//
// The aliases let a test reach readyup by package name -- as this package's own kits do, the way a consumer's kit
// does -- without a prior build standing between the test and the source. Longest specifier first: an alias on `readyup`
// also matches `readyup/check-utils`, and the first match wins.
//
// The coverage entry extends the inherited `src`-only glob, which would otherwise leave the kit tree unmeasured. Kits
// are authored under `.readyup/` rather than `src/` because that is the directory readyup itself reads. One glob
// covers the checks and the helpers alike, since `test-utils/` sits inside the tree it serves; the inherited exclude
// drops the `__tests__/` directories the same glob would otherwise sweep in. The text reporter shows no `test-utils`
// group; those files are in the coverage data regardless.
export default defineVitestConfig({
  project: { env: { RDY_STYLE: 'rich' }, unstubEnvs: true },
  root: {
    resolve: {
      alias: [
        { find: 'readyup/check-utils', replacement: path.resolve(import.meta.dirname, 'src/check-utils/index.ts') },
        { find: 'readyup/testing', replacement: path.resolve(import.meta.dirname, 'src/testing/index.ts') },
        { find: 'readyup', replacement: path.resolve(import.meta.dirname, 'src/index.ts') },
      ],
    },
    test: {
      coverage: {
        include: ['.readyup/kits/**/*.ts'],
      },
    },
  },
});
