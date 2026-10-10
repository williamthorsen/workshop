import type { Writer } from '@williamthorsen/toolbelt.cli/candidate';

import { run } from '../../bin/run.ts';
import { type CloneAdapters, GIT_ADAPTERS } from '../repo-commands.ts';

/** The outcome of a captured run: its exit status, and its stdout and stderr without their final newline. */
export interface CapturedRun {
  status: number;
  stderr: string;
  stdout: string;
}

/** Runs the CLI in process with only the given environment, recording what it writes. */
export async function runCaptured(
  argv: readonly string[],
  setup: { adapters?: CloneAdapters; cwd?: string; env?: Record<string, string> } = {},
): Promise<CapturedRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const status = await run(argv, {
    context: { adapters: setup.adapters ?? GIT_ADAPTERS, cwd: setup.cwd ?? '/', env: setup.env ?? {} },
    stderr: buildRecorder(stderr),
    stdout: buildRecorder(stdout),
  });
  return { status, stderr: joinChunks(stderr), stdout: joinChunks(stdout) };
}

// region | Helpers

/** Builds a writer that appends each chunk that it is given to `chunks`. */
function buildRecorder(chunks: string[]): Writer {
  return {
    write: (chunk: string) => {
      chunks.push(chunk);
    },
  };
}

/** Joins recorded chunks, dropping the final newline. */
function joinChunks(chunks: readonly string[]): string {
  return chunks.join('').replace(/\n$/, '');
}

// endregion | Helpers
