/* eslint n/hashbang: off, n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */

import process from 'node:process';

import { run } from './run.ts';

process.exit(await run(process.argv.slice(2)));
