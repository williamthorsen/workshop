import type { RemoteRefCompareResult } from '../../kits/types.ts';
import { toError } from '../../portable/toError.ts';
import { countAheadBehind } from './count-ahead-behind.ts';
import { type Git, isRefMissingError, realGit } from './run-git.ts';

/** Returns how a local ref relates to its counterpart on a remote, read via `ls-remote` without fetching. */
export async function compareRefToRemote(
  path: string,
  ref: string,
  remote = 'origin',
): Promise<RemoteRefCompareResult> {
  return compareRefToRemoteWith(realGit, path, ref, remote);
}

/** Returns how a local ref relates to its counterpart on a remote, reaching git through `git`. */
export async function compareRefToRemoteWith(
  git: Git,
  path: string,
  ref: string,
  remote = 'origin',
): Promise<RemoteRefCompareResult> {
  const localSha = await resolveLocalRef(git, path, ref);
  if (localSha === undefined) {
    return { status: 'ref-missing', ref };
  }

  let remoteSha: string | undefined;
  try {
    remoteSha = await resolveRemoteRef(git, path, ref, remote);
  } catch (error: unknown) {
    return { status: 'unreachable', error: toError(error) };
  }

  if (remoteSha === undefined) {
    return { status: 'ref-missing', ref: `${remote}/${ref}` };
  }

  if (localSha === remoteSha) {
    return { status: 'in-sync', localSha, remoteSha };
  }

  const aheadBehind = await countAheadBehind(git, path, ref, `${remote}/${ref}`);

  return { status: 'out-of-sync', localSha, remoteSha, ...(aheadBehind && { aheadBehind }) };
}

// region | Helpers

/**
 * Returns a local ref's SHA, or `undefined` when the ref does not exist, rethrowing errors that mean anything else.
 */
async function resolveLocalRef(git: Git, path: string, ref: string): Promise<string | undefined> {
  try {
    return await git.runGit(path, 'rev-parse', '--verify', ref);
  } catch (error: unknown) {
    if (isRefMissingError(error)) return undefined;
    throw error;
  }
}

/**
 * Returns a remote ref's SHA via `ls-remote`, or `undefined` when the ref does not exist. Throws on a network error.
 */
async function resolveRemoteRef(git: Git, path: string, ref: string, remote: string): Promise<string | undefined> {
  const output = await git.runGit(path, 'ls-remote', remote, ref);
  if (!output) return undefined;
  const sha = output.split('\t', 1)[0];
  return sha;
}

// endregion | Helpers
