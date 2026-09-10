import path from 'node:path';

import type { VitestConfigOptions } from '@williamthorsen/nmr/vitest';

// Settings every config in this repo passes to the factory. Vitest resolves one config per run, and a package
// config replaces the root one rather than extending it, so a setting declared in only one of them is missing
// from every run the other config serves. `nmr test:watch` is where that shows: it runs bare `vitest` from the
// repo root, resolving `vitest.config.ts` and collecting every package through it.
//
// The aliases let a test reach readyup by package name -- as this repo's kits do, the way a consumer's kit does --
// without a prior build standing between the test and the source. They stand in for the resolver hook that
// `rdy.ts` registers when readyup runs as a program, which no test reaches, since a test calls the command
// functions directly. Longest specifier first: An alias on `readyup` also matches `readyup/check-utils`, and the
// first match wins.
//
// Restoring a stubbed environment variable is the runner's job rather than a suite's. `unstubEnvs` clears every
// stub before each test, so a suite that stubs one has no hook to undo it.
export const shared: VitestConfigOptions = {
  project: { unstubEnvs: true },
  root: {
    resolve: {
      alias: [
        {
          find: 'readyup/check-utils',
          replacement: path.resolve(import.meta.dirname, 'packages/readyup/src/check-utils/index.ts'),
        },
        {
          find: 'readyup/testing',
          replacement: path.resolve(import.meta.dirname, 'packages/readyup/src/testing/index.ts'),
        },
        { find: 'readyup', replacement: path.resolve(import.meta.dirname, 'packages/readyup/src/index.ts') },
      ],
    },
  },
};
