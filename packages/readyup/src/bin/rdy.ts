/* eslint n/hashbang: off, n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */

import module from 'node:module';
import process from 'node:process';

import { extractMessage } from '../utils/error-handling.ts';
import { routeCommand } from './route.ts';

let exitCode: number;
try {
  // Register the readyup resolver hook before any kit is loaded. Externalized
  // `readyup`/`readyup/*` imports in compiled kits are routed through this hook to
  // the runner's own readyup installation, sidestepping filesystem walk-up from
  // the kit's location. The hook source lives at `src/readyupResolverHook.ts` and
  // is emitted to `dist/esm/readyupResolverHook.js`; from `dist/esm/bin/rdy.js`
  // the runtime path is `'../readyupResolverHook.js'`. Esbuild does not rewrite
  // string literals inside `module.register()` calls, so the `.js` extension is
  // written directly in source. Wrapping this call in the runner's error
  // boundary ensures any registration failure (missing hook file, bad path,
  // Node rejection) surfaces as `rdy: unexpected error: ...` rather than an
  // opaque unhandled exception.
  module.register('../readyupResolverHook.js', {
    parentURL: import.meta.url,
    data: { readyupParentURL: import.meta.url },
  });
  exitCode = await routeCommand(process.argv.slice(2));
} catch (error: unknown) {
  const message = extractMessage(error);
  process.stderr.write(`rdy: unexpected error: ${message}\n`);
  exitCode = 1;
}
process.exit(exitCode);
