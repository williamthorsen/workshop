import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    include: '*.ts',
  },
  internal: {
    dir: 'internal',
  },
  // The checks in these packages will be run by `rdy run --packages`.
  packages: ['@williamthorsen/nmr', '@williamthorsen/release-kit', 'v11y-check'],
});
