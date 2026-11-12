import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

/** Runs `direnv allow` on a directory, returning `'absent'` when direnv is not installed, or the reason for a failure. */
export function allowDirenv(dir: string): string | undefined {
  return describeDirenvRun(runDirenv(['allow', dir]));
}

/** Returns `'absent'` for a run that found no direnv, the reason for another failure, or `undefined` on success. */
export function describeDirenvRun(
  run: Pick<SpawnSyncReturns<string>, 'error' | 'signal' | 'status' | 'stderr'>,
): string | undefined {
  if (run.error !== undefined) {
    return 'code' in run.error && run.error.code === 'ENOENT' ? 'absent' : `cannot run direnv: ${run.error.message}`;
  }
  if (run.signal !== null) return `direnv was killed by ${run.signal}`;
  if (run.status === 0) return undefined;
  return run.stderr.trim().split('\n').at(-1) || `direnv exited ${run.status ?? 'without a status'}`;
}

/** Reports whether direnv can be run on this machine. */
export function isDirenvInstalled(): boolean {
  return describeDirenvRun(runDirenv(['version'])) !== 'absent';
}

// region | Helpers

/** Runs direnv with its output captured. */
function runDirenv(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync('direnv', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// endregion | Helpers
