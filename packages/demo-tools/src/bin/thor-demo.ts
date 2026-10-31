/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import { spawn } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';

import { type Launch, run } from './run.ts';

// A reader that exits first closes the pipe, which node reports as an error event rather than the quiet termination
// that SIGPIPE would give.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
  });
}

const { exitCode, launch, stderr, stdout } = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  homeDir: os.homedir(),
  resolveVersion: () => resolveSelfVersion(import.meta.url),
});

// Wait for each write to flush, so that a warning reaches a pipe before anything that aidemo writes.
await writeFully(process.stdout, stdout);
await writeFully(process.stderr, stderr);

// Set rather than exit, so that buffered output reaches a pipe before the process ends.
process.exitCode = launch === undefined ? exitCode : await runLaunch(launch);

// region | Helpers

/** Returns the exit code of a process killed by `signal`: 128 plus the signal's number, or 1 when it has none. */
function getSignalExitCode(signal: NodeJS.Signals | null): number {
  const number = signal === null ? undefined : os.constants.signals[signal];
  return number === undefined ? 1 : 128 + number;
}

/** Keeps this process alive on an interrupt that also reaches aidemo. */
function ignoreInterrupt(): void {}

/** Runs aidemo with inherited stdio, forwarding termination to it, and resolves to its exit code. */
async function runLaunch({ args, bin, cwd, env }: Launch): Promise<number> {
  const child = spawn(process.execPath, [bin, ...args], { cwd, env, stdio: 'inherit' });

  // A terminal delivers SIGINT to the whole process group, aidemo included, so this process only outlives it. A
  // supervisor such as an MCP client signals this process alone, so SIGTERM and SIGHUP are passed on.
  function forwardSignal(signal: NodeJS.Signals): void {
    child.kill(signal);
  }
  process.on('SIGINT', ignoreInterrupt);
  process.on('SIGTERM', forwardSignal);
  process.on('SIGHUP', forwardSignal);

  try {
    return await new Promise<number>((resolve) => {
      child.on('error', (error) => {
        process.stderr.write(`thor-demo: cannot start aidemo: ${describeError(error)}\n`);
        resolve(1);
      });
      child.on('exit', (code, signal) => {
        resolve(code ?? getSignalExitCode(signal));
      });
    });
  } finally {
    process.off('SIGINT', ignoreInterrupt);
    process.off('SIGTERM', forwardSignal);
    process.off('SIGHUP', forwardSignal);
  }
}

/** Writes `text` to `stream` and resolves once the stream has flushed it. */
async function writeFully(stream: NodeJS.WriteStream, text: string): Promise<void> {
  if (text === '') return;

  await new Promise<void>((resolve) => {
    stream.write(text, () => {
      resolve();
    });
  });
}

// endregion | Helpers
