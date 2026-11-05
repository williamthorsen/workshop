import { spawnSync } from 'node:child_process';

/**
 * Returns the pathspecs, relative to `dir`, that match at least one file tracked in the git work tree containing
 * `dir`, or `undefined` outside a work tree or when git cannot run.
 */
export function findTrackedPaths(dir: string, pathspecs: readonly string[]): string[] | undefined {
  const tracked: string[] = [];
  for (const pathspec of pathspecs) {
    const { error, status, stdout } = spawnSync('git', ['ls-files', '-z', '--', pathspec], {
      cwd: dir,
      encoding: 'utf8',
    });
    if (error !== undefined || status !== 0) return undefined;

    if (stdout !== '') tracked.push(pathspec);
  }

  return tracked;
}
