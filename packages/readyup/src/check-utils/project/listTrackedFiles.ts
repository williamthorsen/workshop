import { isGitRepo } from '../git/repo-predicates.ts';
import { runGitRaw } from '../git/run-git.ts';

/** Tracked-path listings by the `cwd` they were resolved against, held for the life of the process. */
const listingsByCwd = new Map<string, Promise<readonly string[] | undefined>>();

/**
 * Lists the paths git tracks under the working directory, or `undefined` where it is not a git working tree.
 *
 * `undefined` and an empty list are distinct results: a project outside a working tree cannot be swept at all,
 * while one inside an empty tree was swept and holds no tracked file.
 *
 * Memoized per `cwd` for the life of the process. The promise is held rather than the value it settles to, because
 * the runner starts sibling checks together: a cache filled on resolution arrives too late for every check that
 * started alongside the first, and each would invoke git of its own. A rejected listing is dropped, so a failure is
 * retried rather than remembered.
 */
export function listTrackedFiles(): Promise<readonly string[] | undefined> {
  const cwd = process.cwd();

  let listing = listingsByCwd.get(cwd);
  if (listing === undefined) {
    listing = readTrackedPaths(cwd);
    listingsByCwd.set(cwd, listing);
    void listing.catch(() => listingsByCwd.delete(cwd));
  }

  return listing;
}

// region | Helpers

/** Reads the tracked paths of the working tree at `cwd`, or `undefined` where `cwd` is outside one. */
async function readTrackedPaths(cwd: string): Promise<readonly string[] | undefined> {
  if (!(await isGitRepo(cwd))) return undefined;

  // `-z` is what makes the list complete: without it git escapes a path holding a non-ASCII byte and wraps it in
  // quotes, which no reader can open, and that file drops out of the sweep unreported. Reading stdout untrimmed keeps
  // the same promise for the first path, whose leading space or tab a trim would take.
  const tracked = await runGitRaw(cwd, 'ls-files', '-z');
  return tracked.split('\0').filter((path) => path !== '');
}

// endregion | Helpers
