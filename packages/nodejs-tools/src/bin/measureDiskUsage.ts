import fs from 'node:fs';
import path from 'node:path';

// The unit in which `stat` reports `blocks`, whatever the filesystem's block size.
const BLOCK_SIZE = 512;

/**
 * Measures the disk space allocated to a directory tree, as `du` does: Symlinks are not followed, and an inode already
 * in `seenInodes` is not counted again, so a file hardlinked into two trees measured with one set counts once. An
 * entry that disappears during the walk is skipped, and an entry that cannot be read is passed to `onUnreadable` and
 * skipped, so that the rest of the tree is still counted.
 *
 * @internal
 */
export function measureDiskUsage(dir: string, seenInodes: Set<string>, options: MeasureDiskUsageOptions = {}): number {
  let total = 0;
  const pending = [dir];

  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    const stats = attempt(() => fs.lstatSync(current, { throwIfNoEntry: false }), current, options);
    if (stats === undefined) continue;

    const inode = `${stats.dev}:${stats.ino}`;
    if (seenInodes.has(inode)) continue;
    seenInodes.add(inode);
    total += stats.blocks * BLOCK_SIZE;

    if (stats.isDirectory()) {
      pending.push(...(attempt(() => listChildren(current), current, options) ?? []));
    }
  }

  return total;
}

export interface MeasureDiskUsageOptions {
  /** Receives an entry that could not be read, and the error. */
  readonly onUnreadable?: (entry: string, error: unknown) => void;
}

// region | Helpers

/** Runs a read of an entry, passing a failure to `onUnreadable` and returning undefined in its place. */
function attempt<T>(read: () => T, entry: string, options: MeasureDiskUsageOptions): T | undefined {
  try {
    return read();
  } catch (error) {
    options.onUnreadable?.(entry, error);
    return undefined;
  }
}

/** Lists a directory's children, or nothing when it disappeared during the walk. */
function listChildren(dir: string): string[] {
  try {
    return fs.readdirSync(dir).map((name) => path.join(dir, name));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

// endregion | Helpers
