import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    include: '*.ts',
  },
  internal: {
    dir: 'internal',
  },
  // `rdy run --packages` runs the `default` kit of each of these packages.
  packages: ['@williamthorsen/nmr', '@williamthorsen/release-kit', 'v11y-check'],
});
