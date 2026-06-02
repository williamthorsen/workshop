import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn();
const spawnMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}));

const { runChezmoiCaptured, runChezmoiStreamed } = await import('../runChezmoi.ts');

const context = { source: '/abs/source', target: '/abs/target' };

type ExecFileCallback = (error: unknown, result?: { stdout: string; stderr: string }) => void;

/** Drive the promisified `execFile` callback with a successful result. */
function resolveExecFile(stdout: string): void {
  execFileMock.mockImplementation((_cmd: string, _args: string[], callback: ExecFileCallback) => {
    callback(null, { stdout, stderr: '' });
  });
}

/** Drive the promisified `execFile` callback with a rejection carrying captured streams. */
function rejectExecFile(error: Record<string, unknown>): void {
  execFileMock.mockImplementation((_cmd: string, _args: string[], callback: ExecFileCallback) => {
    callback(error);
  });
}

/** A minimal stand-in for the spawned child process, registering close/error handlers. */
interface ChildStub {
  handlers: Map<string, (value: unknown) => void>;
  on: (event: string, handler: (value: unknown) => void) => ChildStub;
}

/** Create a child stub and arrange for `spawn` to return it and emit `event` with `value` on the next microtask. */
function arrangeSpawn(event: string, value: unknown): ChildStub {
  const child: ChildStub = {
    handlers: new Map(),
    on(name, handler) {
      this.handlers.set(name, handler);
      return this;
    },
  };
  spawnMock.mockImplementation((_cmd: string, _args: string[], _options: unknown) => {
    queueMicrotask(() => child.handlers.get(event)?.(value));
    return child;
  });
  return child;
}

/** Read the args array passed to the first `execFile` call. */
function firstExecFileArgs(): string[] {
  const call = execFileMock.mock.calls[0];
  const args: unknown = call?.[1];
  if (!Array.isArray(args)) return [];
  return args.filter((arg): arg is string => typeof arg === 'string');
}

/** Extract the `stdio` option from a spawn options object, returning `undefined` when absent. */
function readStdio(options: unknown): unknown {
  if (typeof options === 'object' && options !== null && 'stdio' in options) {
    return options.stdio;
  }
  return undefined;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe(runChezmoiCaptured, () => {
  it('injects source, destination, throwaway persistent-state and config, and --no-tty', async () => {
    resolveExecFile('output');

    await runChezmoiCaptured(context, ['status']);

    const args = firstExecFileArgs();
    expect(execFileMock.mock.calls[0]?.[0]).toBe('chezmoi');
    expect(args).toContain('--source=/abs/source');
    expect(args).toContain('--destination=/abs/target');
    expect(args).toContain('--no-tty');
    expect(args.some((arg) => arg.startsWith('--persistent-state='))).toBe(true);
    expect(args.some((arg) => arg.startsWith('--config='))).toBe(true);
    expect(args.at(-1)).toBe('status');
  });

  it('returns captured stdout with code 0 on success', async () => {
    resolveExecFile(' M .file\n');

    await expect(runChezmoiCaptured(context, ['status'])).resolves.toStrictEqual({
      stdout: ' M .file\n',
      stderr: '',
      code: 0,
    });
  });

  it('returns the captured non-zero code without rejecting', async () => {
    rejectExecFile({ code: 7, stdout: 'partial', stderr: 'boom' });

    await expect(runChezmoiCaptured(context, ['apply'])).resolves.toStrictEqual({
      stdout: 'partial',
      stderr: 'boom',
      code: 7,
    });
  });

  it('throws a clear error when chezmoi is missing from PATH', async () => {
    rejectExecFile({ code: 'ENOENT' });

    await expect(runChezmoiCaptured(context, ['--version'])).rejects.toThrow(/chezmoi not found on PATH/);
  });
});

describe(runChezmoiStreamed, () => {
  it('inherits child stdout and stderr to process.stderr, never stdout', async () => {
    arrangeSpawn('close', 0);

    await runChezmoiStreamed(context, ['apply']);

    const options: unknown = spawnMock.mock.calls[0]?.[2];
    expect(readStdio(options)).toStrictEqual(['ignore', process.stderr, process.stderr]);
  });

  it('resolves with the child exit code', async () => {
    arrangeSpawn('close', 2);

    await expect(runChezmoiStreamed(context, ['apply'])).resolves.toBe(2);
  });

  it('rejects when the child emits an error', async () => {
    arrangeSpawn('error', new Error('spawn failed'));

    await expect(runChezmoiStreamed(context, ['apply'])).rejects.toThrow(/spawn failed/);
  });
});
