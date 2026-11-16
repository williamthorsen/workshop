/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { ignoreBrokenPipes, installCrashHandler, readAnswer } from '@williamthorsen/toolbelt.cli/candidate';
import { findPackageManagerPin, listStrandedAsdfShims } from '@williamthorsen/toolbelt.nodejs/candidate';
import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';

import { resolvePnpmProvider } from './resolvePnpmProvider.ts';
import { run } from './run.ts';
import { runPnpmVersion } from './runPnpmVersion.ts';

installCrashHandler('thor-node');

ignoreBrokenPipes();

process.exitCode = await run(
  process.argv.slice(2),
  {
    cwd: process.cwd(),
    execPath: process.execPath,
    findPin: findPackageManagerPin,
    homeDir: os.homedir(),
    isStdinTty: () => process.stdin.isTTY,
    listStrandedShims: listStrandedAsdfShims,
    now: Date.now,
    pathDirs: (process.env['PATH'] ?? '').split(path.delimiter),
    readAnswer,
    resolvePnpmProvider,
    resolveVersion: () => resolveSelfVersion(import.meta.url),
    runPnpmVersion,
  },
  { stderr: process.stderr, stdout: process.stdout },
);
