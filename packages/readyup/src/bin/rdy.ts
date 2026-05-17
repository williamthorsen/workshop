/* eslint n/hashbang: off, n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */

import module from 'node:module';
import process from 'node:process';

import { extractMessage } from '../utils/error-handling.ts';
import { routeCommand } from './route.ts';

// Register the readyup resolver hook before any kit is loaded. Externalized
// `readyup`/`readyup/*` imports in compiled kits are routed through this hook to
// the runner's own readyup installation, sidestepping filesystem walk-up from the
// kit's location. The hook source lives at `src/readyupResolverHook.ts` and is
// emitted to `dist/esm/readyupResolverHook.js`; from `dist/esm/bin/rdy.js` the
// runtime path is `'../readyupResolverHook.js'`. Esbuild does not rewrite string
// literals inside `module.register()` calls, so the `.js` extension is written
// directly in source.
module.register('../readyupResolverHook.js', {
  parentURL: import.meta.url,
  data: { readyupParentURL: import.meta.url },
});

let exitCode: number;
try {
  exitCode = await routeCommand(process.argv.slice(2));
} catch (error: unknown) {
  const message = extractMessage(error);
  process.stderr.write(`rdy: unexpected error: ${message}\n`);
  exitCode = 1;
}
process.exit(exitCode);
