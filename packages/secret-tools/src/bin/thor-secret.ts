/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import process from 'node:process';

import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';
import { createKeychainStore, promptSecret } from '@williamthorsen/toolbelt.secrets/candidate';

import { readStreamText } from './readStreamText.ts';
import { run } from './run.ts';

// A reader that exits first closes the pipe, which node reports as an error event rather than the quiet termination
// that SIGPIPE would give.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
  });
}

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
