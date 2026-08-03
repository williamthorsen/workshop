import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    include: '*.ts',
  },
  internal: {
    dir: 'internal',
  },
  packages: ['@williamthorsen/nmr'],
});
