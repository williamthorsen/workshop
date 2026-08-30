import { runGitWithInput } from '../git/run-git.ts';
import { listTrackedFiles } from './listTrackedFiles.ts';

/** The attributes by which a project declares a tracked file to be code that is not its own to change. */
const FOREIGN_ATTRIBUTES = ['linguist-generated', 'linguist-vendored'];

/** The values that leave a file in the sweep: git's two spellings of "not declared", and an explicit opt-out. */
const UNDECLARED_VALUES = new Set(['false', 'unset', 'unspecified']);

/** Foreign-path sets by the `cwd` they were resolved against, held for the life of the process. */
const setsByCwd = new Map<string, Promise<ReadonlySet<string>>>();

/**
 * Names the tracked paths the project declares `linguist-generated` or `linguist-vendored`, which are third-party
 * code a reader could not act on a finding inside.
 *
 * What the declaration means is git's to decide: `git check-attr` applies the pattern syntax, the nested
 * `.gitattributes` files, and the precedence rules, so nothing here parses one. Reading the attribute needs no
 * Linguist install and sees none of Linguist's built-in vendor heuristics, only what the project wrote into its own
 * `.gitattributes`.
 *
 * Memoized per `cwd` for the life of the process, holding the promise rather than the set it settles to, because the
 * runner starts sibling checks together: a cache filled on resolution is too late for every check that started
 * alongside the first, and each would invoke git of its own. A rejected lookup is dropped, so a failure is retried
 * rather than remembered.
 */
export function listForeignPaths(): Promise<ReadonlySet<string>> {
  const cwd = process.cwd();

  let foreign = setsByCwd.get(cwd);
  if (foreign === undefined) {
    foreign = readForeignPaths(cwd);
    setsByCwd.set(cwd, foreign);
    void foreign.catch(() => setsByCwd.delete(cwd));
  }

  return foreign;
}

// region | Helpers

/**
 * Collects the paths `git check-attr -z` reported a declared value for.
 *
 * The output is a flat run of NUL-terminated fields, three to a record, and a path appears once per attribute the
 * query named. Splitting on the separator leaves an empty field after the final one, which the stride skips.
 */
function collectDeclaredPaths(reported: string): ReadonlySet<string> {
  const fields = reported.split('\0');
  const declared = new Set<string>();

  for (let index = 0; index + 2 < fields.length; index += 3) {
    const path = fields[index];
    const value = fields[index + 2];
    if (path !== undefined && value !== undefined && !UNDECLARED_VALUES.has(value)) {
      declared.add(path);
    }
  }

  return declared;
}

/**
 * Reads the declared-foreign subset of the paths tracked at `cwd`, which is empty outside a working tree.
 *
 * Both `git ls-files` and `git check-attr` work in paths relative to the directory they run in, so a sweep from a
 * subdirectory matches a declaration made in the repository root.
 */
async function readForeignPaths(cwd: string): Promise<ReadonlySet<string>> {
  const tracked = await listTrackedFiles();
  if (tracked === undefined || tracked.length === 0) return new Set();

  const paths = tracked.map((path) => `${path}\0`).join('');
  const reported = await runGitWithInput(cwd, paths, 'check-attr', '-z', '--stdin', ...FOREIGN_ATTRIBUTES);

  return collectDeclaredPaths(reported);
}

// endregion | Helpers
