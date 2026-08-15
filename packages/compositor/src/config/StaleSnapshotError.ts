/** The package a snapshot could not answer for, where an unlocated package is what went stale. */
export interface UnlocatedPackage {
  readonly package: string;
  /** The base directory it would have been located from. */
  readonly baseDir: string;
}

/**
 * Raised when a snapshot no longer describes the config being read against it.
 *
 * One class covers both refusals -- a config adopting a package the snapshot never located, and a config whose folded
 * source list has moved away from the one the snapshot was captured over -- because they mean one thing to a caller:
 * locate and capture again. The message names which of the two it is.
 *
 * The unlocated package rides along as data beside that message, so a caller reporting the fault or re-locating the
 * package reads a field rather than parsing prose.
 */
export class StaleSnapshotError extends Error {
  override readonly name = 'StaleSnapshotError';

  /** The package name that went unanswered, absent where the source list itself is what moved. */
  readonly package: string | undefined;
  /** The base directory it would have been located from. */
  readonly baseDir: string | undefined;

  constructor(message: string, unlocated?: UnlocatedPackage) {
    super(message);
    this.package = unlocated?.package;
    this.baseDir = unlocated?.baseDir;
  }
}
