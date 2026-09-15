import { unlinkSync } from 'node:fs';
import path from 'node:path';

import { describeError, isError } from '@williamthorsen/toolbelt.errors';

import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { checkDrift, type DriftStatus } from '../verify/checkDrift.ts';

/** Arguments for pruning the manifest entries that a sweep did not produce. */
export interface PruneOrphanedEntriesArgs {
  /** The entries of the manifest as it stood before the sweep. */
  existingEntries: Iterable<RdyManifestKit>;
  force: boolean;
  manifestDir: string;
  /** Absolute path of the directory into which the sweep compiles, and outside which nothing is deleted. */
  outDir: string;
  /** The name of every kit whose source the sweep attempted, whatever became of it. */
  sweptKitNames: ReadonlySet<string>;
}

/** What became of the orphaned entries of one sweep. */
export interface PruneOutcome {
  /** Orphaned entries that stay in the manifest, because their bundle is still on disk. */
  keptEntries: RdyManifestKit[];
  /** Each orphan that deleted a bundle or kept one, in manifest order. */
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
 * An entry recording no path, one whose bundle is already gone, and one whose bundle lies outside `outDir` are
 * dropped without deleting anything and without an outcome. A file outside `outDir` is none that a sweep writes.
 */
export function pruneOrphanedEntries(args: PruneOrphanedEntriesArgs): PruneOutcome {
  const { existingEntries, force, manifestDir, outDir, sweptKitNames } = args;
  const outcome: PruneOutcome = { keptEntries: [], orphans: [] };

  for (const entry of existingEntries) {
    if (sweptKitNames.has(entry.name) || entry.path === undefined) continue;

    const { name } = entry;
    const bundlePath = path.resolve(manifestDir, entry.path);
    if (!isInsideDirectory(outDir, bundlePath)) continue;

    try {
      const status = force ? undefined : checkDrift(entry, manifestDir);
      if (status?.kind === 'drift') {
        outcome.keptEntries.push(entry);
        outcome.orphans.push({ kind: 'drift', bundlePath, name, status });
      } else if (deleteFile(bundlePath)) {
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

/** Deletes a file, returning `false` where there was none to delete. */
function deleteFile(filePath: string): boolean {
  try {
    unlinkSync(filePath);
    return true;
  } catch (error: unknown) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

/** Reports whether `targetPath` lies below `directory`, rather than being the directory itself or outside it. */
function isInsideDirectory(directory: string, targetPath: string): boolean {
  const relativePath = path.relative(directory, targetPath);
  return relativePath !== '' && !path.isAbsolute(relativePath) && relativePath.split(path.sep)[0] !== '..';
}

/** Reports whether an error is the filesystem's report that a file does not exist. */
function isMissingFileError(error: unknown): boolean {
  return isError(error) && 'code' in error && error.code === 'ENOENT';
}

// endregion | Helpers
