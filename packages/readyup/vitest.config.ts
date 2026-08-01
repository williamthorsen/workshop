import path from 'node:path';

import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// This package keeps a config of its own, against the general rule that packages inherit the root one. The rule
// targets configs that merely restate the shared config; this one carries package-scoped settings that have no
// root-level expression, since a `project` override at the root would apply to every package.
//
// Pinning the style keeps rendering deterministic: left to detection, output would follow whether the runner attached
// a terminal and whether CI was set, so the same assertion would pass locally and fail on the runner. A test wanting
// plain output passes `--style plain`, which outranks this.
//
// The aliases let a test import this package's own kits, which reach readyup by package name the way a consumer's kit
// does, without a prior build standing between the test and the source. Longest specifier first: an alias on `readyup`
// also matches `readyup/check-utils`, and the first match wins.
//
// The coverage entries extend the inherited `src`-only glob, which would otherwise leave both trees unmeasured. Kits
// are authored under `.readyup/` rather than `src/` because that is the directory readyup itself reads, and helpers
// under `test-utils/` are measured on purpose: an uncovered helper is why they sit outside `__tests__/` at all.
// The text reporter prints no `test-utils` group even so; the files are in the coverage data, as the json and html
// reporters show, so this is a reporter display gap rather than a glob that failed to match.
export default defineVitestConfig({
  project: { env: { RDY_STYLE: 'rich' } },
  root: {
    resolve: {
      alias: [
        { find: 'readyup/check-utils', replacement: path.resolve(import.meta.dirname, 'src/check-utils/index.ts') },
        { find: 'readyup', replacement: path.resolve(import.meta.dirname, 'src/index.ts') },
      ],
    },
    test: {
      coverage: {
        include: ['.readyup/kits/**/*.ts', 'test-utils/**/*.ts'],
      },
    },
  },
});
