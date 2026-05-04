import { defineConfig } from '@williamthorsen/nmr';

/** nmr configuration for this repo. */
export default defineConfig({
  rootScripts: {
    'build:post': 'rdy compile',
  },
});
