import type { ExecFileException } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import { runProcess } from '../runProcess.ts';

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

describe(runProcess, () => {
  it('reports a successful run with both streams merged', async () => {
    mockExecFile(null, 'out\n', 'err\n');

    await expect(runProcess('tool', ['arg'])).resolves.toStrictEqual({
      exitCode: 0,
      output: 'out\nerr\n',
      stdout: 'out\n',
    });
    expect(execFileMock.mock.lastCall?.slice(0, 2)).toStrictEqual(['tool', ['arg']]);
  });

  it('resolves with the exit code of a run that exits nonzero', async () => {
    mockExecFile(buildError({ code: 113 }), '', 'Could not find service\n');

    await expect(runProcess('tool', [])).resolves.toMatchObject({
      exitCode: 113,
      output: 'Could not find service\n',
    });
  });

  it('reports exit code 1 for a run ended by a signal', async () => {
    mockExecFile(buildError({ signal: 'SIGTERM' }), '', '');

    await expect(runProcess('tool', [])).resolves.toMatchObject({ exitCode: 1 });
  });

  it('rejects when the program cannot be started', async () => {
    mockExecFile(buildError({ code: 'ENOENT', message: 'spawn tool ENOENT' }), '', '');

    await expect(runProcess('tool', [])).rejects.toThrow('spawn tool ENOENT');
  });
});

// region | Helpers

/** The callback through which `execFile` reports a run. */
type ExecFileCallback = (error: ExecFileException | null, stdout: string, stderr: string) => void;

/** Builds the error that `execFile` passes to its callback. */
function buildError({
  code,
  message = 'Command failed',
  signal,
}: {
  code?: number | string;
  message?: string;
  signal?: NodeJS.Signals;
}): ExecFileException {
  const error: ExecFileException = new Error(message);
  if (code !== undefined) error.code = code;
  if (signal !== undefined) error.signal = signal;

  return error;
}

/** Makes `execFile` call back with the given error and output. */
function mockExecFile(error: ExecFileException | null, stdout: string, stderr: string): void {
  execFileMock.mockImplementation(
    (_command: string, _args: string[], _options: unknown, callback: ExecFileCallback) => {
      callback(error, stdout, stderr);
    },
  );
}

// endregion | Helpers
