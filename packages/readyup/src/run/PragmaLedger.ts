import path from 'node:path';
import process from 'node:process';

/**
 * What one invocation observed about the sources its checks read: which paths were examined, and which
 * sites a pragma declined a finding on.
 *
 * Together they are the evidence the unused-pragma report rests on. A path no check examined yields no
 * report at all, and a site some check declined is a pragma that did its work.
 */
export interface PragmaLedger {
  /** Reports whether a pragma declined a finding at a site. */
  hasDeclined: (filePath: string, line: number) => boolean;

  /** Records that a pragma declined a finding at a site. */
  recordDeclined: (filePath: string, line: number) => void;

  /** Records the paths a check examined. */
  recordScanned: (paths: readonly string[]) => void;

  /** The paths every check of the run examined, in the order they were first recorded. */
  scannedPaths: () => readonly string[];
}

/**
 * Opens a ledger for one invocation.
 *
 * Paths are keyed by their resolved form, so a check declaring an absolute `scanned` path and one reporting
 * a relative finding path agree about the same file. `cwd` is read per record rather than captured, because
 * a path resolves against the directory the run is standing in.
 */
export function createPragmaLedger(): PragmaLedger {
  const scanned = new Set<string>();
  const declined = new Set<string>();

  return {
    hasDeclined: (filePath, line) => declined.has(toSiteKey(filePath, line)),
    recordDeclined: (filePath, line) => {
      declined.add(toSiteKey(filePath, line));
    },
    recordScanned: (paths) => {
      for (const filePath of paths) scanned.add(resolvePath(filePath));
    },
    scannedPaths: () => [...scanned],
  };
}

// region | Helpers

/** Resolves a path against the directory the run is standing in, leaving an absolute one as it came. */
function resolvePath(filePath: string): string {
  return path.resolve(process.cwd(), filePath);
}

/** Keys one located site, by the resolved path holding it and the line it sits on. */
function toSiteKey(filePath: string, line: number): string {
  return `${resolvePath(filePath)}:${line}`;
}

// endregion | Helpers
