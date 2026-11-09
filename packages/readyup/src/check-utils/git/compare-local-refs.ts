import type { LocalRefsCompareResult } from '../../kits/types.ts';
import { countAheadBehind } from './count-ahead-behind.ts';
import { type Git, isRefMissingError, realGit } from './run-git.ts';

/** Returns how two local git refs relate, as a discriminated union. */
export async function compareLocalRefs(path: string, refA: string, refB: string): Promise<LocalRefsCompareResult> {
  return compareLocalRefsWith(realGit, path, refA, refB);
}

/** Returns how two local git refs relate, reaching git through `git`. */
export async function compareLocalRefsWith(
  git: Git,
  path: string,
  refA: string,
  refB: string,
): Promise<LocalRefsCompareResult> {
  const missingRef = await findMissingRef(git, path, refA, refB);
  if (missingRef !== undefined) {
    return { status: 'ref-missing', ref: missingRef };
  }

  const [shaA, shaB] = await Promise.all([git.runGit(path, 'rev-parse', refA), git.runGit(path, 'rev-parse', refB)]);

  if (shaA === shaB) {
    return { status: 'match', shaA, shaB };
  }

  const aheadBehind = await countAheadBehind(git, path, refA, refB);

  return { status: 'mismatch', shaA, shaB, ...(aheadBehind && { aheadBehind }) };
}

// region | Helpers

/** Returns the name of the first ref that does not exist, or `undefined` when both exist. */
async function findMissingRef(git: Git, path: string, refA: string, refB: string): Promise<string | undefined> {
  const [existsA, existsB] = await Promise.all([refExists(git, path, refA), refExists(git, path, refB)]);
  if (!existsA) return refA;
  if (!existsB) return refB;
  return undefined;
}

/** Reports whether a ref exists in the repository, rethrowing errors that mean anything else. */
async function refExists(git: Git, path: string, ref: string): Promise<boolean> {
  try {
    await git.runGit(path, 'rev-parse', '--verify', ref);
    return true;
  } catch (error: unknown) {
    if (isRefMissingError(error)) return false;
    throw error;
  }
}

// endregion | Helpers
