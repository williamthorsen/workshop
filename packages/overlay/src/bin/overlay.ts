/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */
/* eslint n/no-process-exit: off, unicorn/no-process-exit: off -- the bin boundary owns the
   exit code so `run` stays a pure, testable function returning the code. */

import process from 'node:process';

import { run } from './run.ts';

process.exit(await run(process.argv.slice(2)));
