/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import process from 'node:process';

import { ignoreBrokenPipes, installCrashHandler } from '@williamthorsen/toolbelt.cli/candidate';
import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging';

import { run } from './run.ts';

installCrashHandler('thor-image');

ignoreBrokenPipes();

// Set rather than exit, so that buffered output reaches a pipe before the process ends.
process.exitCode = await run(
  process.argv.slice(2),
  { resolveVersion: () => resolveSelfVersion(import.meta.url) },
  { stderr: process.stderr, stdout: process.stdout },
);
