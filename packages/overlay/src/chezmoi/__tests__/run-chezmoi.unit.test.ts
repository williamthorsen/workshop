import { PassThrough } from 'node:stream';

import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverlayError } from '../../errors/OverlayError.ts';

const execFileMock = vi.fn();
const spawnMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}));

const { runChezmoiCaptured, runChezmoiStreamed } = await import('../run-chezmoi.ts');

const context = { source: '/abs/source', target: '/abs/target' };

describe(runChezmoiCaptured, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('injects source, destination, throwaway persistent-state and config, and --no-tty', async () => {
    resolveExecFile('output');

    await runChezmoiCaptured(context, ['status']);

    const args = readFirstExecFileArgs();
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

    await expect(captureError(OverlayError, () => runChezmoiCaptured(context, ['--version']))).resolves.toHaveProperty(
      'message',
      expect.stringMatching(/chezmoi not found on PATH/),
    );
  });
});

describe(runChezmoiStreamed, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hands a stream backed by a file descriptor to the child as that descriptor', async () => {
    arrangeSpawn('close', 0);
    const output = Object.assign(new PassThrough(), { fd: 2 });

    await runChezmoiStreamed(context, ['apply'], output);

    const options: unknown = spawnMock.mock.calls[0]?.[2];
    expect(readStdio(options)).toStrictEqual(['ignore', 2, 2]);
  });

  it('pipes both child streams into a stream without a file descriptor, leaving it open', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.end('out\n');
    stderr.end('err\n');
    arrangeSpawn('close', 0, { stdout, stderr });
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });

    await runChezmoiStreamed(context, ['apply'], output);

    const options: unknown = spawnMock.mock.calls[0]?.[2];
    expect(readStdio(options)).toStrictEqual(['ignore', 'pipe', 'pipe']);
    expect(chunks.join('')).toContain('out\n');
    expect(chunks.join('')).toContain('err\n');
    expect(output.writableEnded).toBe(false);
  });

  it('resolves with the child exit code', async () => {
    arrangeSpawn('close', 2);

    await expect(runChezmoiStreamed(context, ['apply'], new PassThrough())).resolves.toBe(2);
  });

  it('rejects when the child emits an error', async () => {
    arrangeSpawn('error', new Error('spawn failed'));

    await expect(runChezmoiStreamed(context, ['apply'], new PassThrough())).rejects.toThrow(/spawn failed/);
  });
});

// region | Helpers

/** A minimal stand-in for the spawned child process, registering close/error handlers. */
interface ChildStub {
  handlers: Map<string, (value: unknown) => void>;
  on: (event: string, handler: (value: unknown) => void) => ChildStub;
  stdout: PassThrough | null;
  stderr: PassThrough | null;
}

/**
 * Creates a child stub and arranges for `spawn` to return it and emit `event` with `value` on the next macrotask, after
 * any buffered stdio has flowed. The stub's stdio streams are `null`, as for a descriptor-backed spawn, unless `streams`
 * supplies them.
 */
function arrangeSpawn(event: string, value: unknown, streams?: Pick<ChildStub, 'stdout' | 'stderr'>): ChildStub {
  const handlers: ChildStub['handlers'] = new Map();
  const child: ChildStub = {
    handlers,
    stdout: streams?.stdout ?? null,
    stderr: streams?.stderr ?? null,
    on(name, handler) {
      handlers.set(name, handler);
      return child;
    },
  };
  spawnMock.mockImplementation((_cmd: string, _args: string[], _options: unknown) => {
    setTimeout(() => child.handlers.get(event)?.(value), 0);
    return child;
  });
  return child;
}

/** Reads the args array passed to the first `execFile` call. */
function readFirstExecFileArgs(): string[] {
  const call = execFileMock.mock.calls[0];
  const args: unknown = call?.[1];
  if (!Array.isArray(args)) return [];
  return args.filter((arg): arg is string => typeof arg === 'string');
}

/** Extracts the `stdio` option from a spawn options object, returning `undefined` when absent. */
function readStdio(options: unknown): unknown {
  if (typeof options === 'object' && options !== null && 'stdio' in options) {
    return options.stdio;
  }
  return undefined;
}

/** Signature of the Node-style callback the promisified `execFile` drives. */
type ExecFileCallback = (error: unknown, result?: { stdout: string; stderr: string }) => void;

/** Drives the promisified `execFile` callback with a rejection that includes captured streams. */
function rejectExecFile(error: Record<string, unknown>): void {
  execFileMock.mockImplementation((_cmd: string, _args: string[], callback: ExecFileCallback) => {
    callback(error);
  });
}

/** Drives the promisified `execFile` callback with a successful result. */
function resolveExecFile(stdout: string): void {
  execFileMock.mockImplementation((_cmd: string, _args: string[], callback: ExecFileCallback) => {
    callback(null, { stdout, stderr: '' });
  });
}

// endregion | Helpers
