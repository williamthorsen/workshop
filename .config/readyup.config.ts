import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    include: '*.ts',
  },
  internal: {
    dir: 'internal',
  },
  // `rdy run --sources` runs the `default` kit of each of these sources.
  sources: [
    'github:williamthorsen/.github',
    'npm:@williamthorsen/eslint-config-typescript',
    'npm:@williamthorsen/nmr',
    'npm:@williamthorsen/release-kit',
    'npm:@williamthorsen/toolbelt.errors',
    'npm:@williamthorsen/toolbelt.vitest',
    'npm:@williamthorsen/tsconfig',
    'npm:codeassembly',
    'npm:readyup',
    'npm:v11y-check',
  ],
});
