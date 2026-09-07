import { isGitRepo } from '../git/repo-predicates.ts';
import { runGitRaw } from '../git/run-git.ts';

/** Tracked-path listings by the `cwd` against which they were resolved, held for the life of the process. */
const listingsByCwd = new Map<string, Promise<readonly string[] | undefined>>();

/**
 * Lists the paths tracked by git under the working directory, or `undefined` where it is not a git working tree.
 *
 * `undefined` and an empty list are distinct results: A project outside a working tree cannot be swept at all,
 * while one inside an empty tree was swept and holds no tracked file.
 *
 * Lists with `git ls-files -z`. The `-z` makes the list complete: Without it git escapes a path holding a
 * non-ASCII byte and wraps it in quotes, and that file drops out of the sweep unreported. Below the repo root git
 * emits paths relative to `cwd` and limited to that subtree, the same scope in which a relative `readFile` path
 * works, so the listing follows the project in which `rdy` was invoked rather than the repository from which a kit
 * was loaded.
 *
 * The listing is the raw one, without the exclusions applied by `readTrackedSources`, and it reports nothing
 * to the run's sweep recorder. A check walking this listing and reading the files itself therefore declares
 * `scanned` of its own.
 *
 * Memoized per `cwd` for the life of the process. The promise is held rather than the value to which it settles,
 * because the runner starts sibling checks together: A cache filled on resolution is still empty for every check
 * that started alongside the first, and each would invoke git of its own. A rejected listing is dropped, so a
 * failure is retried rather than remembered.
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

  // Read stdout untrimmed, which keeps the first path's leading space or tab that a trim would take.
  const tracked = await runGitRaw(cwd, 'ls-files', '-z');
  return tracked.split('\0').filter((path) => path !== '');
}

// endregion | Helpers
