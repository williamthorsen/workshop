import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Result of a captured (non-streaming) chezmoi invocation. */
export interface CapturedResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Identifies the source and target directories a chezmoi invocation operates on. */
export interface ChezmoiContext {
  source: string;
  target: string;
}

/**
 * Build the chezmoi arguments shared by every invocation.
 *
 * Injects `--source`/`--destination`, the throwaway `--persistent-state` and
 * empty `--config` paths, and `--no-tty`, then the caller's own arguments.
 */
function buildArgs(context: ChezmoiContext, persistentStatePath: string, configPath: string, args: string[]): string[] {
  return [
    `--source=${context.source}`,
    `--destination=${context.target}`,
    `--persistent-state=${persistentStatePath}`,
    `--config=${configPath}`,
    '--no-tty',
    ...args,
  ];
}

/**
 * Run a chezmoi command inside a throwaway state/config sandbox, invoking `body`
 * with the fully-assembled argument list. The sandbox is removed in a `finally`.
 */
async function withSandbox<T>(
  context: ChezmoiContext,
  args: string[],
  body: (fullArgs: string[]) => Promise<T>,
): Promise<T> {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), 'overlay-chezmoi-'));
  const persistentStatePath = path.join(sandboxDir, 'state.boltdb');
  const configPath = path.join(sandboxDir, 'chezmoi.toml');
  try {
    await writeFile(configPath, '');
    const fullArgs = buildArgs(context, persistentStatePath, configPath, args);
    return await body(fullArgs);
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
}

/**
 * Run chezmoi and capture its output. Used for read-only commands (`status`,
 * `--version`) where overlay needs the text rather than live streaming.
 *
 * A non-zero exit does not reject: the captured `code` is returned so callers
 * decide how to interpret it.
 */
export async function runChezmoiCaptured(context: ChezmoiContext, args: string[]): Promise<CapturedResult> {
  return withSandbox(context, args, async (fullArgs) => {
    try {
      const { stdout, stderr } = await execFileAsync('chezmoi', fullArgs);
      return { stdout, stderr, code: 0 };
    } catch (error: unknown) {
      return interpretExecFileError(error);
    }
  });
}

/**
 * Run chezmoi with the child's stdout and stderr inherited to overlay's
 * `process.stderr`, never stdout. Used for every `apply` that may run `run_`
 * scripts, so script output streams live while overlay's stdout stays clean for
 * the reporter or `--json`. Resolves with the child's exit code.
 */
export async function runChezmoiStreamed(context: ChezmoiContext, args: string[]): Promise<number> {
  return withSandbox(context, args, async (fullArgs) => {
    return new Promise<number>((resolve, reject) => {
      const child = spawn('chezmoi', fullArgs, { stdio: ['ignore', process.stderr, process.stderr] });
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    });
  });
}

/** Translate an `execFile` rejection into a `CapturedResult`, surfacing a missing binary as a clear error. */
function interpretExecFileError(error: unknown): CapturedResult {
  if (isExecFileError(error)) {
    if (error.code === 'ENOENT') {
      throw new Error('chezmoi not found on PATH — install it (e.g. `brew install chezmoi`)');
    }
    return {
      stdout: typeof error.stdout === 'string' ? error.stdout : '',
      stderr: typeof error.stderr === 'string' ? error.stderr : '',
      code: typeof error.code === 'number' ? error.code : 1,
    };
  }
  throw error;
}

/** Shape of a Node `execFile` rejection carrying captured streams and an exit code. */
interface ExecFileError {
  code?: number | string;
  stdout?: unknown;
  stderr?: unknown;
}

function isExecFileError(error: unknown): error is ExecFileError {
  return typeof error === 'object' && error !== null;
}
