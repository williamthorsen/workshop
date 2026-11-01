/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';

import { archiveTake } from '../archive/archive-take.ts';
import type { TakeDisposition } from '../archive/plan-take.ts';
import { readSourceState } from '../clients/git/read-source-state.ts';
import { runInvocation } from '../voice/invocation.ts';
import { performVoiceSetup, type VoiceSetupRequest } from '../voice/perform-voice-setup.ts';
import { type Launch, run } from './run.ts';

// A reader that exits first closes the pipe, which node reports as an error event rather than the quiet termination
// that SIGPIPE would give.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
  });
}

const { exitCode, launch, setup, stderr, stdout } = await run(process.argv.slice(2), {
  arch: process.arch,
  cwd: process.cwd(),
  env: process.env,
  homeDir: os.homedir(),
  platform: process.platform,
  readSourceState,
  resolveVersion: () => resolveSelfVersion(import.meta.url),
});

// Wait for each write to flush, so that a warning reaches a pipe before anything that aidemo writes.
await writeFully(process.stdout, stdout);
await writeFully(process.stderr, stderr);

// Set rather than exit, so that buffered output reaches a pipe before the process ends.
process.exitCode = await completeRequest();

// region | Helpers

/** Performs what the run requested, resolving to the exit code. */
async function completeRequest(): Promise<number> {
  if (launch !== undefined) return completeLaunch(launch);
  if (setup !== undefined) return completeSetup(setup);
  return exitCode;
}

/** Runs aidemo, then, when it succeeds, does what the launch says to do with the take, resolving to the exit code. */
async function completeLaunch(launch: Launch): Promise<number> {
  const aidemoExitCode = await runLaunch(launch);
  if (aidemoExitCode !== 0 || launch.take === undefined) return aidemoExitCode;

  return completeTake(launch.take);
}

/** Archives the take or reports why it is not archived, resolving to the exit code. */
async function completeTake(take: TakeDisposition): Promise<number> {
  const prefix = 'thor-demo render';
  if (take.kind === 'notice') {
    await writeFully(process.stderr, `${prefix}: ${take.message}\n`);
    return 0;
  }

  const outcome = await archiveTake(take.plan);
  if (outcome.ok) {
    await writeFully(process.stderr, `${prefix}: archived take to ${outcome.takeDir}\n`);
    return 0;
  }

  const outputDir = path.join(take.plan.demoDir, 'output');
  await writeFully(process.stderr, `${prefix}: ${outcome.message}; the take remains in ${outputDir}\n`);
  return 1;
}

/** Performs a voice setup, reporting each step on stderr and the verification recording's path on stdout. */
async function completeSetup(request: VoiceSetupRequest): Promise<number> {
  const prefix = 'thor-demo voice setup';
  const outcome = await performVoiceSetup(request, {
    report: (line) => process.stderr.write(`${prefix}: ${line}\n`),
    run: runInvocation,
  });
  if (!outcome.ok) {
    await writeFully(process.stderr, `${prefix}: ${outcome.message}\n`);
    return 1;
  }

  await writeFully(process.stderr, `${prefix}: listen to the verification recording to judge the clone\n`);
  await writeFully(process.stdout, `${outcome.verifyPath}\n`);
  return 0;
}

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
