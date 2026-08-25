import path from 'node:path';

import { compareStrings } from '../portable/compareStrings.ts';
import { readDirNames } from '../portable/readDirNames.ts';

/** What deciding which directories a run's removals empty needs. */
export interface CollectPrunableDirsInput {
  /** The target's root on disk. */
  readonly root: string;
  /** The destinations the run removes, POSIX and relative to the root. */
  readonly removed: ReadonlySet<string>;
  /** The destinations the run writes, POSIX and relative to the root. */
  readonly written: ReadonlySet<string>;
  /** The directories the target holds independently of the composition, POSIX and relative to the root. */
  readonly containerDirs: ReadonlySet<string>;
}

/**
 * Collects the directories a run's removals empty, deepest first.
 *
 * Emptiness is computed rather than observed: a directory is empty when everything it holds is either a destination
 * this run removes or a directory this run already took away, and when nothing the run writes lands anywhere beneath
 * it. Both halves of the run have to be read. A real run has deleted its files and written its own by the time it
 * asks, and a dry run has done neither, so a listing reports differently for the two; `removed` and `written` are what
 * make them agree without a second code path.
 *
 * The walk climbs from each removed destination and stops at a container directory, which the target holds whether or
 * not the composition leaves anything in it. Nothing stops the climb at the target's root, no candidate reaching it:
 * a root-relative path's ancestors run out first.
 *
 * Deepest first, so a directory is decided after the ones beneath it and a caller removing them in this order never
 * meets a directory its own children still occupy.
 */
export async function collectPrunableDirs(input: CollectPrunableDirsInput): Promise<Array<string>> {
  const { containerDirs, removed, root, written } = input;
  const occupied = new Set([...written].flatMap((filePath) => collectAncestors(filePath)));
  const candidates = [...new Set([...removed].flatMap((filePath) => collectAncestors(filePath)))]
    .filter((dir) => !containerDirs.has(dir) && !occupied.has(dir))
    .toSorted((left, right) => measureDepth(right) - measureDepth(left) || compareStrings(left, right));

  const prunable = new Set<string>();
  for (const dir of candidates) {
    const names = await readDirNames(path.join(root, dir));
    const held = names.filter((name) => {
      const entry = path.posix.join(dir, name);
      return !removed.has(entry) && !prunable.has(entry);
    });

    if (held.length === 0) {
      prunable.add(dir);
    }
  }

  return candidates.filter((dir) => prunable.has(dir));
}

// region | Helpers

/** Collects every directory a path sits beneath, deepest first, stopping short of the root it is relative to. */
function collectAncestors(filePath: string): Array<string> {
  const ancestors: Array<string> = [];
  let dir = path.posix.dirname(filePath);

  while (dir !== '.' && dir !== '/' && dir !== '') {
    ancestors.push(dir);
    dir = path.posix.dirname(dir);
  }

  return ancestors;
}

/** Measures how far below the root a directory sits, which is the order the candidates are decided in. */
function measureDepth(dir: string): number {
  return dir.split('/').length;
}

// endregion | Helpers
