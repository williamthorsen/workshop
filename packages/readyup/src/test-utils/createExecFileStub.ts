import type { Mock } from 'vitest';
import { vi } from 'vitest';

/** The part of a spawned child that a caller writing to stdin touches. */
interface StubbedChild {
  readonly stdin: { end: (chunk: string) => void; on: () => void };
}

/** The callback form of `execFile`, as a suite's mocked `node:child_process` exports it. */
type ExecFileStub = Mock<
  (
    file: string,
    args: string[],
    options: unknown,
    callback: (error: Error | null, stdout: string) => void,
  ) => StubbedChild
>;

/** What a stubbed run reports back: the stdout it succeeds with, or the error it fails with. */
export interface StubbedRun {
  readonly error?: Error;
  readonly stdout?: string;
}

/**
 * Builds a stand-in for `execFile`'s callback form, which is what `runGitWithInput` calls and what `promisify` does
 * not cover.
 *
 * `respond` is handed everything the caller wrote to the child's stdin, along with the arguments the command ran
 * with, and names what the run reports back. A suite asserts against its own `respond` rather than against the stub,
 * which `vi.mock` hoisting keeps out of the suite's reach.
 */
export function createExecFileStub(respond: (input: string, args: readonly string[]) => StubbedRun): ExecFileStub {
  return vi.fn(
    (_file: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string) => void) => {
      const written: string[] = [];
      queueMicrotask(() => {
        const { error, stdout = '' } = respond(written.join(''), args);
        callback(error ?? null, stdout);
      });

      return {
        stdin: {
          end: (chunk: string) => {
            written.push(chunk);
          },
          on: () => {
            // Production registers an EPIPE handler here; no stubbed run emits one.
          },
        },
      };
    },
  );
}
