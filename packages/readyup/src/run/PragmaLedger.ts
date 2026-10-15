import path from 'node:path';
import process from 'node:process';

import type { CheckIds } from './resolveCheckIds.ts';

/**
 * What one invocation observed about the sources read by its checks: which paths were examined, which
 * sites a pragma suppressed a finding on, and the ids of every check that its kits loaded.
 *
 * Together they are the evidence on which the unused-pragma report rests. A path examined by no check yields
 * no report at all, a site suppressed by some check is a pragma that did its work, and an id that no loaded check
 * accepts is one that the report names. The examined paths are also the candidates that the unmarked-generated
 * report judges.
 */
export interface PragmaLedger {
  /** The ids of every check loaded by the invocation's kits, in the order they were recorded. */
  checkIds: () => readonly CheckIds[];

  /** Reports whether a pragma suppressed a finding at a site. */
  hasSuppressed: (filePath: string, line: number) => boolean;

  /** Records the ids of a check that a kit loaded. */
  recordCheckIds: (ids: CheckIds) => void;

  /** Records that a pragma suppressed a finding at a site. */
  recordSuppressed: (filePath: string, line: number) => void;

  /** Records the paths examined by a check. */
  recordScanned: (paths: readonly string[]) => void;

  /** The paths examined by every check of the run, in the order they were first recorded. */
  scannedPaths: () => readonly string[];
}

/**
 * Opens a ledger for one invocation.
 *
 * Paths are keyed by their resolved form, so a check declaring an absolute `scanned` path and one reporting
 * a relative finding path agree about the same file. `cwd` is read per record rather than captured, because
 * a path resolves against the run's current directory.
 */
export function createPragmaLedger(): PragmaLedger {
  const checkIds: CheckIds[] = [];
  const scanned = new Set<string>();
  const suppressed = new Set<string>();

  return {
    checkIds: () => [...checkIds],
    hasSuppressed: (filePath, line) => suppressed.has(toSiteKey(filePath, line)),
    recordCheckIds: (ids) => {
      checkIds.push(ids);
    },
    recordSuppressed: (filePath, line) => {
      suppressed.add(toSiteKey(filePath, line));
    },
    recordScanned: (paths) => {
      for (const filePath of paths) scanned.add(resolvePath(filePath));
    },
    scannedPaths: () => [...scanned],
  };
}

// region | Helpers

/** Resolves a path against the run's current directory, leaving an absolute one as it came. */
function resolvePath(filePath: string): string {
  return path.resolve(process.cwd(), filePath);
}

/** Keys one located site by the resolved path of the file that contains it and the line on which it appears. */
function toSiteKey(filePath: string, line: number): string {
  return `${resolvePath(filePath)}:${line}`;
}

// endregion | Helpers
