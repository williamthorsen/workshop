import { defineRdyConfig } from 'readyup';

/**
 * Readyup configuration for readyup's own kits.
 *
 * The non-recursive `include` keeps the check modules under `kits/checks/` out of the compile sweep;
 * esbuild inlines them into each bundle through their relative imports. Every `.ts` directly under
 * `kits/` is a kit, so anything shared between kits has to sit one level down.
 */
export default defineRdyConfig({
  compile: {
    include: '*.ts',
  },
});
