import { spawnSync } from 'node:child_process';

/**
 * Returns the paths, relative to `dir`, that the ignore rules of the git work tree containing `dir` do not cover, a
 * tracked path included, or `undefined` outside a work tree or when git cannot run.
 */
export function findUnignoredPaths(dir: string, paths: readonly string[]): string[] | undefined {
  if (paths.length === 0) return [];

  // NUL-separated in both directions, because git quotes a name that contains a space otherwise.
  const { error, status, stdout } = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
    cwd: dir,
    encoding: 'utf8',
    input: `${paths.join('\0')}\0`,
  });
  // Exit 1 means that none of the paths is ignored.
  if (error !== undefined || (status !== 0 && status !== 1)) return undefined;

  const ignored = new Set(stdout.split('\0'));
  return paths.filter((candidate) => !ignored.has(candidate));
}
