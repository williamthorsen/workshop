import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Result of a captured (non-streaming) chezmoi invocation. */
export interface CapturedResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Identifies the source and target directories a chezmoi invocation operates on. */
export interface ChezmoiDirs {
  source: string;
  target: string;
}

/** Adapter through which overlay invokes chezmoi, so that tests can substitute a fake. */
export interface ChezmoiRunner {
  runCaptured(dirs: ChezmoiDirs, args: string[]): Promise<CapturedResult>;
  runStreamed(dirs: ChezmoiDirs, args: string[], output: NodeJS.WritableStream): Promise<number>;
}

/** Directories of an overlay run, the runner that invokes chezmoi against them, and the stream for streamed output. */
export interface ChezmoiContext extends ChezmoiDirs {
  output: NodeJS.WritableStream;
  runner: ChezmoiRunner;
}

/**
 * Runs chezmoi and captures its output. Used for read-only commands (`status`, `--version`) where overlay needs the
 * text rather than live streaming.
 *
 * A non-zero exit does not reject: the captured `code` is returned so callers decide how to interpret it.
 */
export async function runChezmoiCaptured(dirs: ChezmoiDirs, args: string[]): Promise<CapturedResult> {
  return withSandbox(dirs, args, async (fullArgs) => {
    try {
      const { stdout, stderr } = await execFileAsync('chezmoi', fullArgs);
      return { stdout, stderr, code: 0 };
    } catch (error: unknown) {
      return interpretExecFileError(error);
    }
  });
}

/**
 * Runs chezmoi with the child's stdout and stderr both sent to `output`. Used for every `apply` that may run `run_`
 * scripts, so script output streams live. Resolves with the child's exit code, never ending `output`.
 *
 * A stream backed by a file descriptor is handed to the child as that descriptor, so scripts write to it directly and
 * see a terminal when it is one. Any other stream receives both child streams through pipes.
 */
export async function runChezmoiStreamed(
  dirs: ChezmoiDirs,
  args: string[],
  output: NodeJS.WritableStream,
): Promise<number> {
  return withSandbox(dirs, args, async (fullArgs) => {
    return new Promise<number>((resolve, reject) => {
      const stdio = hasFileDescriptor(output) ? output.fd : 'pipe';
      const child = spawn('chezmoi', fullArgs, { stdio: ['ignore', stdio, stdio] });
      child.stdout?.pipe(output, { end: false });
      child.stderr?.pipe(output, { end: false });
      child.on('error', reject);
      // Node emits `close` only after the child's stdio streams end, so every piped chunk has been written by then.
      child.on('close', (code) => resolve(code ?? 1));
    });
  });
}

/** Runner that invokes the chezmoi binary on `PATH`. */
export const chezmoiRunner: ChezmoiRunner = { runCaptured: runChezmoiCaptured, runStreamed: runChezmoiStreamed };

// region | Helpers

/**
 * Builds the chezmoi arguments shared by every invocation.
 *
 * Injects `--source`/`--destination`, the throwaway `--persistent-state` and empty `--config` paths, and `--no-tty`,
 * then the caller's own arguments.
 */
function buildArgs(dirs: ChezmoiDirs, persistentStatePath: string, configPath: string, args: string[]): string[] {
  return [
    `--source=${dirs.source}`,
    `--destination=${dirs.target}`,
    `--persistent-state=${persistentStatePath}`,
    `--config=${configPath}`,
    '--no-tty',
    ...args,
  ];
}

/** Reports whether `stream` exposes an open file descriptor that a child process can write to directly. */
function hasFileDescriptor(stream: NodeJS.WritableStream): stream is NodeJS.WritableStream & { fd: number } {
  return 'fd' in stream && typeof stream.fd === 'number';
}

/** Translates an `execFile` rejection into a `CapturedResult`, surfacing a missing binary as a clear error. */
function interpretExecFileError(error: unknown): CapturedResult {
  if (isExecFileError(error)) {
    if (error.code === 'ENOENT') {
      throw new Error('chezmoi not found on PATH; install it (e.g. `brew install chezmoi`)');
    }
    return {
      stdout: typeof error.stdout === 'string' ? error.stdout : '',
      stderr: typeof error.stderr === 'string' ? error.stderr : '',
      code: typeof error.code === 'number' ? error.code : 1,
    };
  }
  throw error;
}

/** Shape of a Node `execFile` rejection with captured streams and an exit code. */
interface ExecFileError {
  code?: number | string;
  stdout?: unknown;
  stderr?: unknown;
}

function isExecFileError(error: unknown): error is ExecFileError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Runs a chezmoi command inside a throwaway state/config sandbox, invoking `body` with the fully-assembled argument
 * list. The sandbox is removed in a `finally`.
 */
async function withSandbox<T>(dirs: ChezmoiDirs, args: string[], body: (fullArgs: string[]) => Promise<T>): Promise<T> {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), 'overlay-chezmoi-'));
  const persistentStatePath = path.join(sandboxDir, 'state.boltdb');
  const configPath = path.join(sandboxDir, 'chezmoi.toml');
  try {
    await writeFile(configPath, '');
    const fullArgs = buildArgs(dirs, persistentStatePath, configPath, args);
    return await body(fullArgs);
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
}

// endregion | Helpers
