import type { LocalRefsCompareResult } from '../../kits/types.ts';
import { isRefMissingError, runGit } from './run-git.ts';

/** Returns how two local git refs relate, as a discriminated union. */
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

  return { status: 'mismatch', shaA, shaB, ...(aheadBehind && { aheadBehind }) };
}

/** Returns the name of the first ref that does not exist, or `undefined` where both exist. */
async function findMissingRef(path: string, refA: string, refB: string): Promise<string | undefined> {
  const [existsA, existsB] = await Promise.all([refExists(path, refA), refExists(path, refB)]);
  if (!existsA) return refA;
  if (!existsB) return refB;
  return undefined;
}

/** Reports whether a ref exists in the repository, rethrowing errors that mean anything else. */
async function refExists(path: string, ref: string): Promise<boolean> {
  try {
    await runGit(path, 'rev-parse', '--verify', ref);
    return true;
  } catch (error: unknown) {
    if (isRefMissingError(error)) return false;
    throw error;
  }
}

/** Returns the ahead/behind counts between two refs, or `undefined` where they cannot be computed. */
async function resolveAheadBehind(
  path: string,
  refA: string,
  refB: string,
): Promise<{ ahead: number; behind: number } | undefined> {
  try {
    const output = await runGit(path, 'rev-list', '--count', '--left-right', `${refA}...${refB}`);
    const aheadStr = output.split('\t', 1)[0];
    const behindStr = output.split('\t', 2)[1];
    if (aheadStr === undefined || behindStr === undefined) return undefined;
    const ahead = Number(aheadStr);
    const behind = Number(behindStr);
    if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return undefined;
    return { ahead, behind };
  } catch {
    return undefined;
  }
}
