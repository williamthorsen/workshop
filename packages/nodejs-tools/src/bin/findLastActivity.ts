import fs from 'node:fs';
import path from 'node:path';

const GITDIR_LINE = /^gitdir:\s*(.+?)\s*$/m;

/**
 * Finds when a project directory was last active: the mtime of the git index of its enclosing work tree, which every
 * stage, commit, and checkout rewrites, or the directory's own mtime when it has no work tree or the index is missing.
 * A linked worktree or submodule is read from the index that its `.git` file points to.
 *
 * @internal
 */
export function findLastActivity(dir: string): LastActivity {
  const indexPath = findGitIndexPath(dir);
  const indexTime = indexPath === undefined ? undefined : readMtime(indexPath);
  if (indexPath !== undefined && indexTime !== undefined) return { source: indexPath, time: indexTime };

  return { source: dir, time: fs.statSync(dir).mtimeMs };
}

export interface LastActivity {
  /** The file or directory whose mtime decided the time. */
  readonly source: string;
  /** Milliseconds since the epoch. */
  readonly time: number;
}

// region | Helpers

/** Finds the index of the nearest work tree at or above a directory, or undefined outside one. */
function findGitIndexPath(startDir: string): string | undefined {
  for (let dir = path.resolve(startDir); ; dir = path.dirname(dir)) {
    const gitPath = path.join(dir, '.git');
    const stats = fs.lstatSync(gitPath, { throwIfNoEntry: false });
    if (stats?.isDirectory() === true) return path.join(gitPath, 'index');
    if (stats?.isFile() === true) return resolveGitFileIndex(gitPath);
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** Reads a file's mtime, or undefined when it does not exist. */
function readMtime(filePath: string): number | undefined {
  return fs.statSync(filePath, { throwIfNoEntry: false })?.mtimeMs;
}

/** Resolves the index that a `.git` file's `gitdir:` line points to, relative to the file's directory. */
function resolveGitFileIndex(gitFile: string): string | undefined {
  const match = GITDIR_LINE.exec(fs.readFileSync(gitFile, 'utf8'));
  const gitDir = match?.[1];
  if (gitDir === undefined) return undefined;

  return path.join(path.resolve(path.dirname(gitFile), gitDir), 'index');
}

// endregion | Helpers
