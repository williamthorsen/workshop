import process from 'node:process';

import { type MockInstance, vi } from 'vitest';

/** The output a command wrote while a test ran. */
export interface CapturedStdio {
  readonly stdout: string;
  readonly stderr: string;
  /** Empties both buffers, which a test comparing two invocations of the same command needs between them. */
  reset(): void;
}

/** Options for a captured-stdio fixture. */
export interface CapturedStdioOptions {
  /** Captures `console.info` into stdout and `console.error` into stderr, for commands that report through them. */
  console?: boolean;
}

/** The fixture shape `test.extend` accepts: a setup that hands the value to `use` and resumes for teardown. */
type StdioFixture = (context: object, use: (value: CapturedStdio) => Promise<void>) => Promise<void>;

/**
 * Returns a fixture that buffers both output streams and exposes them as text.
 *
 * `process.stdout.isTTY` is saved and restored around every test, so a test may assign it directly to exercise
 * style detection without leaking the value into the tests that follow.
 */
export function createStdioFixture(options: CapturedStdioOptions = {}): StdioFixture {
  const { console: captureConsole = false } = options;

  // eslint-disable-next-line no-empty-pattern -- Vitest parses this pattern to detect fixture dependencies.
  return async ({}, use) => {
    const outChunks: string[] = [];
    const errChunks: string[] = [];
    const originalIsTty = process.stdout.isTTY;

    const spies: MockInstance[] = [
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        outChunks.push(String(chunk));
        return true;
      }),
      vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
        errChunks.push(String(chunk));
        return true;
      }),
    ];

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

    await use({
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
    });

    process.stdout.isTTY = originalIsTty;
    for (const spy of spies) {
      spy.mockRestore();
    }
  };
}
