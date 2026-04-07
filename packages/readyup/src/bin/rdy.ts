/* eslint n/hashbang: off, n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */

import process from 'node:process';

import { routeCommand } from './route.ts';

let exitCode: number;
try {
  exitCode = await routeCommand(process.argv.slice(2));
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`rdy: unexpected error: ${message}\n`);
  exitCode = 1;
}
process.exit(exitCode);
