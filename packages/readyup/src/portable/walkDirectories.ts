import { type Dirent, readdirSync } from 'node:fs';
import path from 'node:path';

import picomatch from 'picomatch';

/** Globs pruned when the caller names none: dependency trees and dot-directories. */
const DEFAULT_PRUNE_GLOBS = ['**/node_modules', '**/.*'];

/** Directory levels below the root the sweep descends when the caller sets no cap. */
const DEFAULT_MAX_DEPTH = 10;

/** Filesystem errors that cost the sweep one directory rather than the whole answer. */
const SKIPPABLE_ERROR_CODES = new Set(['EACCES', 'ENOENT', 'EPERM']);

/**
 * Matcher options shared by `match` and `prune`.
 *
 * `dot` is on so that pruning is the only thing excluding anything: picomatch otherwise stops `**` at a
 * dot-segment, hiding a dot-directory even from a caller who cleared `prune` to sweep it.
 */
const MATCHER_OPTIONS = { dot: true };

/** Options for `walkDirectories`. */
export interface WalkDirectoriesOptions {
  /** Directory the sweep descends from. Every returned path is relative to it. */
  root: string;
  /**
   * Glob matched against each entry the sweep meets, file and directory alike, as a path relative to
   * `root`. A matching entry contributes the directory holding it, so a recursive glob ending in
   * `/package.json` names the directories that hold one.
   */
  match: string;
  /**
   * Globs matched against directory paths. A matching directory is neither traversed nor yielded, and
   * nothing else excludes anything: clearing this sweeps the whole tree, dot-directories included.
   */
  prune?: string[];
  /** Directory levels below `root` the sweep descends. */
  maxDepth?: number;
}

/**
 * Returns the root-relative paths of the directories holding an entry that matches `match`, sorted.
 *
 * The root itself is `'.'`, and appears when it holds a match of its own. Paths are POSIX-separated
 * whatever the platform, so a caller may hand them to a glob or print them without rewriting.
 */
export function walkDirectories(options: WalkDirectoriesOptions): string[] {
  const { root, match, prune = DEFAULT_PRUNE_GLOBS, maxDepth = DEFAULT_MAX_DEPTH } = options;

  const isMatch = picomatch(match, MATCHER_OPTIONS);
  const isPruned = picomatch(prune, MATCHER_OPTIONS);

  const directories = new Set<string>();
  sweepDirectory({ root, isMatch, isPruned, maxDepth, directories }, '.', 0);

  return [...directories].toSorted();
}

// region | Helpers

/** Everything the recursive sweep carries down, bound once by `walkDirectories`. */
interface SweepContext {
  root: string;
  isMatch: (entryPath: string) => boolean;
  isPruned: (directoryPath: string) => boolean;
  maxDepth: number;
  directories: Set<string>;
}

/** Type guard for Node.js filesystem errors carrying a `code`. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Visits one directory, recording it when it holds a match and descending into the children left unpruned.
 *
 * Pruning is settled before matching, so a pruned directory is neither recorded nor descended into.
 */
function sweepDirectory(context: SweepContext, relativeDir: string, depth: number): void {
  const absoluteDir = relativeDir === '.' ? context.root : path.join(context.root, relativeDir);

  let entries: Dirent[];
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true, encoding: 'utf8' });
  } catch (error: unknown) {
    // A directory that is missing or barred to this process costs the sweep that one directory.
    // Anything else is systemic (EMFILE, EIO), and an incomplete sweep must not pass for a complete one.
    const code = isNodeError(error) ? error.code : undefined;
    if (code !== undefined && SKIPPABLE_ERROR_CODES.has(code)) return;
    throw error;
  }

  const childDirs: string[] = [];
  for (const entry of entries) {
    const entryPath = relativeDir === '.' ? entry.name : `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (context.isPruned(entryPath)) continue;
      childDirs.push(entryPath);
    }
    if (context.isMatch(entryPath)) context.directories.add(relativeDir);
  }

  if (depth >= context.maxDepth) return;
  for (const childDir of childDirs) {
    sweepDirectory(context, childDir, depth + 1);
  }
}

// endregion | Helpers
