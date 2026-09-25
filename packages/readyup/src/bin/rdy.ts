/* eslint n/hashbang: off, n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */

import module from 'node:module';
import process from 'node:process';

import { hasJsonFlag } from './hasJsonFlag.ts';
import { resolveHookSpecifier } from './resolveHookSpecifier.ts';
import { reportEscapedFailure, reportFailure, routeCommand } from './route.ts';

const args = process.argv.slice(2);

// These listeners catch a failure that no awaited call observes, which the `try` below cannot reach.
process.on('uncaughtException', exitOnEscapedFailure);
process.on('unhandledRejection', exitOnEscapedFailure);

let exitCode: number;
try {
  // Register the readyup resolver hook before any kit is loaded. Externalized
  // `readyup`/`readyup/*` imports in compiled kits are routed through this hook to
  // the runner's own readyup installation, sidestepping filesystem walk-up from
  // the kit's location. The hook is one directory up from this file in both
  // layouts -- `src/readyupResolverHook.ts` under tsx, `dist/esm/readyupResolverHook.js`
  // in the compiled build -- so `resolveHookSpecifier` derives the extension from this
  // runner's own URL rather than hardcoding one. (The extension cannot be deferred to the
  // build: nmr-compile rewrites specifiers only in import/export/`import()` positions,
  // never a `module.register()` argument.) Wrapping this call in the runner's error
  // boundary ensures any registration failure (missing hook file, bad path, Node
  // rejection) is reported through the same error channel as any other failure rather than
  // as an opaque unhandled exception.
  module.register(resolveHookSpecifier(import.meta.url), {
    parentURL: import.meta.url,
    data: { readyupParentURL: import.meta.url },
  });
  exitCode = await routeCommand(args);
} catch (error: unknown) {
  // Because anything reaching here escaped `routeCommand`'s boundary, it is classified `internal`.
  exitCode = reportFailure(error, hasJsonFlag(args));
}
process.exit(exitCode);

// region | Helpers

/** Reports a failure that escaped every awaited call and ends the process with the exit code that it produced. */
function exitOnEscapedFailure(error: unknown): never {
  process.exit(reportEscapedFailure(error, hasJsonFlag(args)));
}

// endregion | Helpers
