import process from 'node:process';

import { afterEach, beforeEach, type MockInstance, vi } from 'vitest';

/** The output a command wrote while a test ran. */
export interface CapturedStdio {
  readonly stdout: string;
  readonly stderr: string;
  /** Empties both buffers, which a test comparing two invocations of the same command needs between them. */
  reset(): void;
}

/** Options for captured stdio. */
export interface CapturedStdioOptions {
  /** Captures `console.info` into stdout and `console.error` into stderr, for commands that report through them. */
  console?: boolean;
}

/**
 * Registers stream capture for the enclosing suite and returns a handle exposing both streams as text.
 *
 * `process.stdout.isTTY` is saved and restored around every test, so a test may assign it directly to exercise
 * style detection without leaking the value into the tests that follow.
 */
export function useCapturedStdio(options: CapturedStdioOptions = {}): CapturedStdio {
  const { console: captureConsole = false } = options;

  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const spies: MockInstance[] = [];
  const originalIsTty = process.stdout.isTTY;

  beforeEach(() => {
    outChunks.length = 0;
    errChunks.length = 0;

    spies.push(
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        outChunks.push(String(chunk));
        return true;
      }),
      vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
        errChunks.push(String(chunk));
        return true;
      }),
    );

    if (captureConsole) {
      spies.push(
        vi.spyOn(console, 'info').mockImplementation((chunk: unknown) => {
          outChunks.push(`${String(chunk)}\n`);
        }),
        vi.spyOn(console, 'error').mockImplementation((chunk: unknown) => {
          errChunks.push(`${String(chunk)}\n`);
        }),
      );
    }
  });

  afterEach(() => {
    process.stdout.isTTY = originalIsTty;
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies.length = 0;
  });

  return {
    get stdout() {
      return outChunks.join('');
    },
    get stderr() {
      return errChunks.join('');
    },
    reset() {
      outChunks.length = 0;
      errChunks.length = 0;
    },
  };
}
