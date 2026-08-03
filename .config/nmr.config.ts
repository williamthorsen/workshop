import { defineConfig } from '@williamthorsen/nmr/config';

/** nmr configuration for this repo. */
export default defineConfig({
  devBin: {
    // Run the readyup bin from TypeScript source so `build:post` needs no prior build.
    rdy: 'node packages/readyup/src/bin/rdy.ts',
  },
  rootScripts: {
    'build:post': 'rdy compile',
    // Checks are cwd-relative, so the kit has to run from the package it audits. A root
    // `rdy run --from npm:readyup publishing` would audit the repo root instead.
    'ci:post': 'pnpm --filter readyup run verify:kits',
  },
});
