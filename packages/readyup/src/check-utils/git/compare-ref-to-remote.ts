import type { RemoteRefCompareResult } from '../../types.ts';
import { runGit } from './run-git.ts';

/** Compare a local ref to its counterpart on a remote. Uses `ls-remote` (no fetch). */
export async function compareRefToRemote(
  path: string,
  ref: string,
  remote = 'origin',
): Promise<RemoteRefCompareResult> {
  const localSha = await resolveLocalRef(path, ref);
  if (localSha === undefined) {
    return { status: 'ref-missing', ref };
  }

  let remoteSha: string | undefined;
  try {
    remoteSha = await resolveRemoteRef(path, ref, remote);
  } catch (error: unknown) {
    return { status: 'unreachable', error: toError(error) };
  }

  if (remoteSha === undefined) {
    return { status: 'ref-missing', ref: `${remote}/${ref}` };
  }

  if (localSha === remoteSha) {
    return { status: 'in-sync', localSha, remoteSha };
  }

  const aheadBehind = await resolveAheadBehind(path, ref, remote);

  return { status: 'out-of-sync', localSha, remoteSha, ...(aheadBehind ? { aheadBehind } : {}) };
}

/** Resolve a local ref to its SHA, or undefined if it doesn't exist. Rethrow non-ref-missing errors. */
async function resolveLocalRef(path: string, ref: string): Promise<string | undefined> {
  try {
    return await runGit(path, 'rev-parse', '--verify', ref);
  } catch (error: unknown) {
    if (isRefMissingError(error)) return undefined;
    throw error;
  }
}

/** Resolve a remote ref to its SHA via ls-remote. Return undefined if the ref doesn't exist. Throw on network errors. */
async function resolveRemoteRef(path: string, ref: string, remote: string): Promise<string | undefined> {
  const output = await runGit(path, 'ls-remote', remote, ref);
  if (!output) return undefined;
  const sha = output.split('\t')[0];
  return sha;
}

/** Compute ahead/behind from the local tracking ref. Return undefined on failure. */
async function resolveAheadBehind(
  path: string,
  ref: string,
  remote: string,
): Promise<{ ahead: number; behind: number } | undefined> {
  try {
    const output = await runGit(path, 'rev-list', '--count', '--left-right', `${ref}...${remote}/${ref}`);
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

/** Coerce an unknown value to an Error. */
function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(String(value));
}
