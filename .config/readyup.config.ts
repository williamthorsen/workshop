import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    include: '*.ts',
  },
  internal: {
    dir: 'internal',
  },
  // `rdy run --packages` runs the `default` kit of each of these packages.
  packages: [
    '@williamthorsen/eslint-config-typescript',
    '@williamthorsen/nmr',
    '@williamthorsen/release-kit',
    '@williamthorsen/toolbelt.errors',
    '@williamthorsen/toolbelt.vitest',
    '@williamthorsen/tsconfig',
    'codeassembly',
    'readyup',
    'v11y-check',
  ],
});
