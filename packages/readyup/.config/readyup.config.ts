import { defineRdyConfig } from 'readyup';

/**
 * Readyup configuration for readyup's own kits.
 *
 * The non-recursive `include` keeps the shared helpers under `kits/lib/` out of the compile sweep;
 * esbuild inlines them into each bundle through their relative imports.
 */
export default defineRdyConfig({
  compile: {
    include: '*.ts',
  },
});
