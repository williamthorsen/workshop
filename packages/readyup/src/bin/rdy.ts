/* eslint n/hashbang: off, n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */

import module from 'node:module';
import process from 'node:process';

import { initialize, load, resolve } from '../readyupResolverHook.ts';
import { hasJsonFlag } from './hasJsonFlag.ts';
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
  // the kit's location. Registering inside the runner's error boundary ensures any
  // registration failure is reported through the same error channel as any other failure
  // rather than as an opaque unhandled exception.
  initialize({ readyupParentURL: import.meta.url });
  module.registerHooks({ load, resolve });
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
