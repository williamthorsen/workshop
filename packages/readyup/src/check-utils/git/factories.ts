import type { LocalRefsCompareResult, RdyCheck, RemoteRefCompareResult } from '../../types.ts';
import { compareLocalRefs } from './compare-local-refs.ts';
import { compareRefToRemote } from './compare-ref-to-remote.ts';

interface LocalRefSyncCheckOptions {
  /** Display name for the check. */
  name: string;
  /** Path to the git repository. */
  path: string;
  /** First local ref (e.g., a branch name). */
  refA: string;
  /** Second local ref to compare against. */
  refB: string;
  /** Custom remediation message. Overrides the default. */
  fix?: string;
}

interface RemoteRefSyncCheckOptions {
  /** Display name for the check. */
  name: string;
  /** Path to the git repository. */
  path: string;
  /** Local ref to compare (e.g., a branch name). */
  ref: string;
  /** Remote name. Default: `origin`. */
  remote?: string;
  /** Custom remediation message. Overrides the default. */
  fix?: string;
}

/** Create a check that verifies two local refs point to the same commit. */
export function makeLocalRefSyncCheck(options: LocalRefSyncCheckOptions): RdyCheck {
  const { name, path, refA, refB, fix: customFix } = options;

  const check: RdyCheck = {
    name,
    async check() {
      const result = await compareLocalRefs(path, refA, refB);
      if (result.status === 'match') return true;
      return { ok: false, detail: formatLocalResult(result, refA, refB, path) };
    },
  };
  if (customFix !== undefined) check.fix = customFix;
  return check;
}

/** Create a check that verifies a local ref matches its remote counterpart. Uses a closure-cached probe so the network call runs at most once. */
export function makeRemoteRefSyncCheck(options: RemoteRefSyncCheckOptions): RdyCheck {
  const { name, path, ref, remote = 'origin', fix: customFix } = options;

  let probe: Promise<RemoteRefCompareResult> | undefined;

  function getProbe(): Promise<RemoteRefCompareResult> {
    if (probe === undefined) {
      probe = compareRefToRemote(path, ref, remote);
    }
    return probe;
  }

  const rdyCheck: RdyCheck = {
    name,
    async skip() {
      const result = await getProbe();
      if (result.status === 'unreachable') {
        return `remote '${remote}' is unreachable — skipping network check`;
      }
      return false;
    },
    async check() {
      const result = await getProbe();
      if (result.status === 'in-sync') return true;
      return { ok: false, detail: formatRemoteResult(result, ref, remote, path) };
    },
  };
  if (customFix !== undefined) rdyCheck.fix = customFix;
  return rdyCheck;
}

/** Format a human-readable detail message for a local ref comparison failure. */
function formatLocalResult(
  result: Exclude<LocalRefsCompareResult, { status: 'match' }>,
  refA: string,
  refB: string,
  path: string,
): string {
  if (result.status === 'ref-missing') {
    return `ref '${result.ref}' does not exist in ${path}`;
  }

  const { aheadBehind } = result;
  if (aheadBehind === undefined) {
    return `${refA} and ${refB} have diverged in ${path}`;
  }

  const { ahead, behind } = aheadBehind;
  if (ahead > 0 && behind > 0) {
    return `${refA} and ${refB} have diverged, with ${ahead} and ${behind} different commits each`;
  }
  if (behind > 0) {
    return `${refA} is behind ${refB} by ${behind} commit${behind === 1 ? '' : 's'} — run 'git merge ${refB}' in ${path}`;
  }
  return `${refA} is ahead of ${refB} by ${ahead} commit${ahead === 1 ? '' : 's'}`;
}

/** Format a human-readable detail message for a remote ref comparison failure. */
function formatRemoteResult(
  result: Exclude<RemoteRefCompareResult, { status: 'in-sync' }>,
  ref: string,
  remote: string,
  path: string,
): string {
  if (result.status === 'ref-missing') {
    return `ref '${result.ref}' does not exist`;
  }
  if (result.status === 'unreachable') {
    return `remote '${remote}' is unreachable`;
  }

  const { aheadBehind } = result;
  if (aheadBehind === undefined) {
    return `${ref} and ${remote}/${ref} have diverged in ${path}`;
  }

  const { ahead, behind } = aheadBehind;
  if (ahead > 0 && behind > 0) {
    return `${ref} and ${remote}/${ref} have diverged, with ${ahead} and ${behind} different commits each`;
  }
  if (behind > 0) {
    return `${ref} is behind ${remote}/${ref} by ${behind} commit${behind === 1 ? '' : 's'} — run 'git pull' in ${path}`;
  }
  return `${ref} is ahead of ${remote}/${ref} by ${ahead} commit${ahead === 1 ? '' : 's'}`;
}
