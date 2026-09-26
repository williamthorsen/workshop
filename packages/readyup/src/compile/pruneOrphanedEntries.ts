import { rmdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { describeError, isError } from '@williamthorsen/toolbelt.errors';

import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { isInsideDirectory } from '../portable/isInsideDirectory.ts';
import { checkDrift, type DriftStatus } from '../verify/checkDrift.ts';

/** Arguments for pruning the manifest entries that a sweep did not produce. */
export interface PruneOrphanedEntriesArgs {
  /** The entries of the manifest as it was before the sweep. */
  existingEntries: Iterable<RdyManifestKit>;
  force: boolean;
  manifestDir: string;
  /** Absolute path of the directory into which the sweep compiles, and outside which nothing is deleted. */
  outDir: string;
  /** Absolute path of the bundle that every attempted source compiles to, whatever became of it. */
  sweptBundlePaths: ReadonlySet<string>;
  /** The name of every kit whose source the sweep attempted, whatever became of it. */
  sweptKitNames: ReadonlySet<string>;
}

/** What became of the orphaned entries of one sweep. */
export interface PruneOutcome {
  /** Orphaned entries that stay in the manifest, because their bundle is still on disk. */
  keptEntries: RdyManifestKit[];
  /** Each orphan whose bundle was deleted or kept, in manifest order. */
  orphans: OrphanOutcome[];
}

/**
 * What became of one orphan's bundle: deleted, kept because it was edited since it was compiled, or kept because
 * deleting it failed. `bundlePath` is absolute.
 */
export type OrphanOutcome =
  | { kind: 'removed'; bundlePath: string; name: string }
  | { kind: 'drift'; bundlePath: string; name: string; status: Extract<DriftStatus, { kind: 'drift' }> }
  | { kind: 'failed'; bundlePath: string; message: string; name: string };

/**
 * Deletes the bundle of each manifest entry that no source in the sweep produced, and returns what became of each.
 *
 * An entry is an orphan when its name matches none of the swept kits. Its bundle is deleted when it lies inside
 * `outDir` and still matches the hash recorded for it, or when no hash was recorded, which is the rule under which a
 * compile overwrites a bundle. A drifted bundle is kept unless `force` is set, and one that cannot be deleted is kept.
 * Both keep their entry, because the manifest still describes a file on disk.
 *
 * An orphan whose bundle the sweep just wrote is dropped without deleting anything: The entry named that bundle under
 * a name that no source claims any more, and the file itself belongs to the kit that now claims it. This is how the
 * prune sees a rename, whether the source moved or the naming rule changed.
 *
 * An entry recording no path, one whose bundle is already gone, and one whose bundle lies outside `outDir` are
 * dropped without deleting anything and without an outcome. A sweep writes no file outside `outDir`.
 */
export function pruneOrphanedEntries(args: PruneOrphanedEntriesArgs): PruneOutcome {
  const { existingEntries, force, manifestDir, outDir, sweptBundlePaths, sweptKitNames } = args;
  const outcome: PruneOutcome = { keptEntries: [], orphans: [] };

  for (const entry of existingEntries) {
    if (sweptKitNames.has(entry.name) || entry.path === undefined) continue;

    const { name } = entry;
    const bundlePath = path.resolve(manifestDir, entry.path);
    if (sweptBundlePaths.has(bundlePath) || !isInsideDirectory(outDir, bundlePath)) continue;

    try {
      const status = force ? undefined : checkDrift(entry, manifestDir);
      if (status?.kind === 'drift') {
        outcome.keptEntries.push(entry);
        outcome.orphans.push({ kind: 'drift', bundlePath, name, status });
      } else if (deleteFile(bundlePath)) {
        removeEmptiedDirectories(path.dirname(bundlePath), outDir);
        outcome.orphans.push({ kind: 'removed', bundlePath, name });
      }
    } catch (error: unknown) {
      outcome.keptEntries.push(entry);
      outcome.orphans.push({ kind: 'failed', bundlePath, message: describeError(error), name });
    }
  }

  return outcome;
}

// region | Helpers

/**
 * Removes each directory from `directory` upward that a deletion left empty, stopping below `outDir`.
 *
 * The walk stops at the first directory that still contains something and at any directory that cannot be
 * removed. A directory left empty is untidy rather than wrong, so nothing here fails the compile, and
 * `outDir` itself stays whether or not the sweep emptied it.
 */
function removeEmptiedDirectories(directory: string, outDir: string): void {
  for (let current = directory; isInsideDirectory(outDir, current); current = path.dirname(current)) {
    try {
      rmdirSync(current);
    } catch {
      return;
    }
  }
}

/** Deletes a file, returning `false` when there was none to delete. */
function deleteFile(filePath: string): boolean {
  try {
    unlinkSync(filePath);
    return true;
  } catch (error: unknown) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

/** Reports whether an error is the filesystem's report that a file does not exist. */
function isMissingFileError(error: unknown): boolean {
  return isError(error) && 'code' in error && error.code === 'ENOENT';
}

// endregion | Helpers
