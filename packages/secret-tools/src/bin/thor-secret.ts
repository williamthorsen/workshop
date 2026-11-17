/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import process from 'node:process';

import { ignoreBrokenPipes, installCrashHandler, readStreamText } from '@williamthorsen/toolbelt.cli/candidate';
import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';
import { createKeychainStore, promptSecret } from '@williamthorsen/toolbelt.secrets/candidate';

import { PROGRAM_NAME, run } from './run.ts';

installCrashHandler(PROGRAM_NAME);

ignoreBrokenPipes();

const { exitCode, stderr, stdout } = await run(process.argv.slice(2), {
  createStore: (keychain) => (keychain === undefined ? createKeychainStore() : createKeychainStore({ keychain })),
  isStdinTty: () => process.stdin.isTTY,
  promptSecret: () => promptSecret(process.stdin, process.stderr),
  readStdin: () => readStreamText(process.stdin),
  resolveVersion: () => resolveSelfVersion(import.meta.url),
});

if (stdout !== '') process.stdout.write(stdout);
if (stderr !== '') process.stderr.write(stderr);

// Set rather than exit, so that buffered output reaches a pipe before the process ends.
process.exitCode = exitCode;
