/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import { randomInt } from 'node:crypto';
import process from 'node:process';

import { ignoreBrokenPipes, installCrashHandler } from '@williamthorsen/toolbelt.cli/candidate';
import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging';

import { CATALOGUE_PATH, readCatalogue } from '../catalogue/read-catalogue.ts';
import { MAX_SEED } from '../jobs/parse-flag-values.ts';
import { runWorker } from '../worker/run-worker.ts';
import { run } from './run.ts';

installCrashHandler('thor-image');

ignoreBrokenPipes();

// Set rather than exit, so that buffered output reaches a pipe before the process ends.
process.exitCode = await run(
  process.argv.slice(2),
  {
    arch: process.arch,
    cwd: process.cwd(),
    drawSeed: () => randomInt(MAX_SEED + 1),
    env: process.env,
    now: () => new Date(),
    platform: process.platform,
    readCatalogue: () => readCatalogue(CATALOGUE_PATH),
    resolveVersion: () => resolveSelfVersion(import.meta.url),
    runWorker,
  },
  { stderr: process.stderr, stdout: process.stdout },
);
