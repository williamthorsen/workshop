/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { ignoreBrokenPipes, installCrashHandler, readAnswer } from '@williamthorsen/toolbelt.cli/candidate';
import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';

import { createNpmClient } from '../npm/createNpmClient.ts';
import { run } from './run.ts';

installCrashHandler('thor-npm');

ignoreBrokenPipes();

// Set rather than exit, so that buffered output reaches a pipe before the process ends.
process.exitCode = await run(
  process.argv.slice(2),
  {
    createTempDir: () => fs.mkdtempSync(path.join(os.tmpdir(), 'thor-npm-')),
    cwd: () => process.cwd(),
    isStdinTty: () => process.stdin.isTTY,
    isStdoutTty: () => process.stdout.isTTY,
    npm: createNpmClient({ cwd: process.cwd(), env: process.env, platform: process.platform }),
    readAnswer,
    resolveVersion: () => resolveSelfVersion(import.meta.url),
    stdoutColumns: () => process.stdout.columns,
  },
  { stderr: process.stderr, stdout: process.stdout },
);
