/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';

import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';

import { createNpmClient } from '../npm/createNpmClient.ts';
import { run } from './run.ts';

// A reader that exits first closes the pipe, which node reports as an error event rather than the quiet termination
// that SIGPIPE would give.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
  });
}

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

// region | Helpers

/** Resolves to the answer to a question, or undefined when the interface rejects it. */
async function askQuietly(reader: readline.Interface, question: string): Promise<string | undefined> {
  try {
    return await reader.question(question);
  } catch {
    return;
  }
}

/** Asks a question on stderr and resolves to the line typed on stdin, or undefined when input ends first. */
async function readAnswer(question: string): Promise<string | undefined> {
  const reader = readline.createInterface({ input: process.stdin, output: process.stderr });
  const closed = new Promise<undefined>((resolve) => {
    reader.once('close', () => {
      resolve(undefined);
    });
  });

  try {
    return await Promise.race([askQuietly(reader, question), closed]);
  } finally {
    reader.close();
  }
}

// endregion | Helpers
