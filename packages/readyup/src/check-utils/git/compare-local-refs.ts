import type { LocalRefsCompareResult } from '../../types.ts';
import { runGit } from './run-git.ts';

/** Compare two local git refs and return a discriminated-union result. */
export async function compareLocalRefs(path: string, refA: string, refB: string): Promise<LocalRefsCompareResult> {
  const missingRef = await findMissingRef(path, refA, refB);
  if (missingRef !== undefined) {
    return { status: 'ref-missing', ref: missingRef };
  }

  const [shaA, shaB] = await Promise.all([runGit(path, 'rev-parse', refA), runGit(path, 'rev-parse', refB)]);

  if (shaA === shaB) {
    return { status: 'match', shaA, shaB };
  }

  const aheadBehind = await resolveAheadBehind(path, refA, refB);

  return { status: 'mismatch', shaA, shaB, ...(aheadBehind ? { aheadBehind } : {}) };
}

/** Return the name of the first ref that does not exist, or undefined if both exist. */
async function findMissingRef(path: string, refA: string, refB: string): Promise<string | undefined> {
  const [existsA, existsB] = await Promise.all([refExists(path, refA), refExists(path, refB)]);
  if (!existsA) return refA;
  if (!existsB) return refB;
  return undefined;
}

/** Check whether a ref exists in the repository. Rethrow non-ref-missing errors. */
async function refExists(path: string, ref: string): Promise<boolean> {
  try {
    await runGit(path, 'rev-parse', '--verify', ref);
    return true;
  } catch (error: unknown) {
    if (isRefMissingError(error)) return false;
    throw error;
  }
}

/** Compute ahead/behind counts between two refs. Return undefined on failure. */
async function resolveAheadBehind(
  path: string,
  refA: string,
  refB: string,
): Promise<{ ahead: number; behind: number } | undefined> {
  try {
    const output = await runGit(path, 'rev-list', '--count', '--left-right', `${refA}...${refB}`);
    const [aheadStr, behindStr] = output.split('\t');
    const ahead = Number(aheadStr);
    const behind = Number(behindStr);
    if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return undefined;
    return { ahead, behind };
  } catch {
    return undefined;
  }
}

/** Determine whether an error represents a missing ref (git exit code 128). */
function isRefMissingError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (!('code' in error)) return false;
  const { code } = error;
  return code === 128;
}
