import { existsSync } from 'node:fs';

import { expandHome, runGit } from './run-git.ts';

/** Reports whether `path` is inside a git working tree, counting subdirectories and worktrees. */
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

/** Reports whether `path` is the top of a git working tree, so a subdirectory yields `false`. */
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
