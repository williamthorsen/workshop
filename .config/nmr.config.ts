import { defineConfig } from '@williamthorsen/nmr';

/** nmr configuration for this repo. */
export default defineConfig({
  devBin: {
    // Run the readyup bin from TypeScript source so `build:post` needs no prior build.
    rdy: 'tsx packages/readyup/src/bin/rdy.ts',
  },
  rootScripts: {
    'build:post': 'rdy compile',
  },
});
