import { existsSync } from 'node:fs';

import { expandHome, runGit } from './run-git.ts';

/** Check whether `path` is inside a git working tree (subdirectories and worktrees count). */
export async function isGitRepo(path: string): Promise<boolean> {
  const resolved = expandHome(path);
  if (!existsSync(resolved)) return false;
  try {
    await runGit(resolved, 'rev-parse', '--git-dir');
    return true;
  } catch {
    return false;
  }
}

/** Check whether `path` is the top of a git working tree. Subdirectories return false. */
export async function isAtRepoRoot(path: string): Promise<boolean> {
  const resolved = expandHome(path);
  if (!existsSync(resolved)) return false;
  try {
    const cdup = await runGit(resolved, 'rev-parse', '--show-cdup');
    return cdup === '';
  } catch {
    return false;
  }
}
