import path from 'node:path';
import process from 'node:process';

import { readSourceText } from '../check-utils/project/readTrackedSources.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import { isJsFamilyPath, listPragmaSites, type PragmaSite } from './listPragmaSites.ts';
import type { PragmaLedger } from './PragmaLedger.ts';

/** One pragma that suppressed nothing, named the way the warning about it prints. */
interface UnusedPragma extends PragmaSite {
  /** The path relative to `cwd`, the form findings print in. */
  displayPath: string;
}

/**
 * Emits an advisory stderr warning for each pragma that suppressed nothing, and returns the entries.
 *
 * The evidence is what the run's checks read: a pragma is reported only where some check examined the file
 * holding it, by sweeping it or by declaring it, and no check suppressed a finding on the line it covers. A file
 * no check examined yields no entry, because the run holds no evidence either way about the pragmas in it.
 *
 * Each examined file is read and scanned once however many checks examined it, and only a JS-family source is
 * scanned at all, recognition resting on syntax the blanking reads.
 *
 * Mirrors `warnOnMaskedSkips`: the stderr lines are written in both output modes, and the returned entries are
 * what JSON mode captures into the report for a consumer that owns only stdout.
 */
export function warnOnUnusedPragmas(ledger: PragmaLedger): RaisedWarning[] {
  const unused = listUnusedPragmas(ledger).toSorted(byPathThenLine);

  const warnings = unused.map((pragma) => toWarning(pragma));
  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  }
  return warnings;
}

// region | Helpers

/** Orders two pragmas by the path printed for them, then by the line they sit on. */
function byPathThenLine(a: UnusedPragma, b: UnusedPragma): number {
  if (a.displayPath !== b.displayPath) return a.displayPath < b.displayPath ? -1 : 1;
  return a.line - b.line;
}

/** Returns every pragma in the run's examined sources against which no check suppressed a finding. */
function listUnusedPragmas(ledger: PragmaLedger): UnusedPragma[] {
  const unused: UnusedPragma[] = [];

  for (const scannedPath of ledger.scannedPaths()) {
    if (!isJsFamilyPath(scannedPath)) continue;

    // Read by the path a sweep read it under, so the sweep's cached text is what the scan reads.
    const displayPath = path.relative(process.cwd(), scannedPath);
    const text = readSourceText(displayPath);
    if (text === undefined) continue;

    for (const site of listPragmaSites(text)) {
      if (!ledger.hasSuppressed(scannedPath, site.coveredLine)) unused.push({ ...site, displayPath });
    }
  }

  return unused;
}

/** Composes the warning one unused pragma raises. */
function toWarning(pragma: UnusedPragma): RaisedWarning {
  return {
    code: 'pragma-unused',
    message: `\`${pragma.token}\` pragma at ${pragma.displayPath}:${pragma.line} suppressed no finding in this run.`,
    remedy: 'Remove the pragma, or run the kit whose check it was written for.',
  };
}

// endregion | Helpers
