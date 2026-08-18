import { defineConfig } from '@williamthorsen/nmr/config';

/** nmr configuration for this repo. */
export default defineConfig({
  devBin: {
    // Run the readyup bin from TypeScript source so the root's `rdy` hooks need no prior build.
    rdy: 'node packages/readyup/src/bin/rdy.ts',
  },
  rootScripts: {
    'build:post': 'rdy compile',
    // Validate readyup's own CodeAssembly content, so a defect fails this build rather than a consumer's install.
    'check:content': 'codeassembly validate --content packages/readyup/agents',
    'check:strict:post': ['check:content'],
    // Checks are cwd-relative, so the kit has to run from the package it audits. A root
    // `rdy run --from npm:readyup publishing` would audit the repo root instead.
    'ci:post': 'pnpm --filter readyup run verify:kits',
    // `build:post` recompiles every kit, so a committed bundle's freshness is observable only before the build.
    'ci:pre': 'rdy verify --rebuild',
  },
});
