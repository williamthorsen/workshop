import path from 'node:path';
import process from 'node:process';

import { readSourceText } from '../check-utils/project/readTrackedSources.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import { isJsFamilyPath, listPragmaSites, type PragmaSite } from './listPragmaSites.ts';
import type { PragmaLedger } from './PragmaLedger.ts';
import type { CheckIds } from './resolveCheckIds.ts';

/** The remedy for an unused pragma whose every id names a check of the run, or that names none. */
const GENERIC_REMEDY = 'Remove the pragma, or run the kit whose check it was written for.';

/** The remedy for an unused pragma naming an id that no check in the run shares, even unqualified. */
const ID_FORM_REMEDY =
  'Name a check by the id printed beside its findings, such as `<package>/<id>`; or remove the pragma, or run the kit whose check it was written for.';

/** One pragma that suppressed nothing, named the way the warning about it prints. */
interface UnusedPragma extends PragmaSite {
  /** The path relative to `cwd`, the form in which findings print. */
  displayPath: string;
}

/**
 * Emits an advisory stderr warning for each pragma that suppressed nothing, and returns the entries.
 *
 * The evidence is what the run's checks read: A pragma is reported only when some check examined the file
 * that contains it, by sweeping it or by declaring it, and no check suppressed a finding on the line that it covers. A
 * file examined by no check yields no entry, because the run has no evidence either way about the pragmas in it.
 *
 * Each examined file is read and scanned once however many checks examined it, and only a JS-family source is
 * scanned at all, because recognition relies on the syntax that the blanking reads.
 *
 * A pragma naming ids that no check of the run accepts has them named in its warning, with the printed form of each
 * check that declares the same unqualified id, or the general `<package>/<id>` form when none does.
 *
 * Mirrors `warnOnMaskedSkips`: The stderr lines are written in both output modes, and the returned entries are
 * what JSON mode captures into the report for a consumer that owns only stdout.
 */
export function warnOnUnusedPragmas(ledger: PragmaLedger): RaisedWarning[] {
  const unused = listUnusedPragmas(ledger).toSorted(byPathThenLine);

  const checkIds = ledger.checkIds();
  const warnings = unused.map((pragma) => toWarning(pragma, checkIds));
  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  }
  return warnings;
}

// region | Helpers

/** Orders two pragmas by the path printed for them, then by the line on which they sit. */
function byPathThenLine(a: UnusedPragma, b: UnusedPragma): number {
  if (a.displayPath !== b.displayPath) return a.displayPath < b.displayPath ? -1 : 1;
  return a.line - b.line;
}

/** Returns every pragma in the run's examined sources against which no check suppressed a finding. */
function listUnusedPragmas(ledger: PragmaLedger): UnusedPragma[] {
  const unused: UnusedPragma[] = [];

  for (const scannedPath of ledger.scannedPaths()) {
    if (!isJsFamilyPath(scannedPath)) continue;

    // Read the file by the path under which a sweep read it, so that the scan reads the sweep's cached text.
    const displayPath = path.relative(process.cwd(), scannedPath);
    const text = readSourceText(displayPath);
    if (text === undefined) continue;

    for (const site of listPragmaSites(text)) {
      if (!ledger.hasSuppressed(scannedPath, site.coveredLine)) unused.push({ ...site, displayPath });
    }
  }

  return unused;
}

/** Returns the remedy for the ids that an unused pragma names and no check of the run accepts. */
function composeIdRemedy(unmatched: readonly string[], checkIds: readonly CheckIds[]): string {
  const clauses: string[] = [];
  let isAnyUnsuggested = false;

  for (const id of unmatched) {
    const printed = [...new Set(checkIds.filter((ids) => ids.bare === id).map((ids) => ids.printed))];
    if (printed.length === 0) {
      isAnyUnsuggested = true;
      continue;
    }
    clauses.push(`Write \`${id}\` as ${printed.map((form) => `\`${form}\``).join(' or ')}.`);
  }

  if (isAnyUnsuggested) clauses.push(ID_FORM_REMEDY);
  return clauses.join(' ');
}

/** Returns the ids named by a pragma that no check of the run accepts, each once, in the pragma's order. */
function listUnmatchedIds(pragma: UnusedPragma, checkIds: readonly CheckIds[]): string[] {
  const unmatched = pragma.checkIds.filter((id) => checkIds.every((ids) => !ids.accepted.includes(id)));
  return [...new Set(unmatched)];
}

/** Composes the warning raised by one unused pragma. */
function toWarning(pragma: UnusedPragma, checkIds: readonly CheckIds[]): RaisedWarning {
  const site = `\`${pragma.token}\` pragma at ${pragma.displayPath}:${pragma.line} suppressed no finding in this run`;
  const unmatched = listUnmatchedIds(pragma, checkIds);
  if (unmatched.length === 0) return { code: 'pragma-unused', message: `${site}.`, remedy: GENERIC_REMEDY };

  const named = unmatched.map((id) => `\`${id}\``).join(', ');
  const verb = unmatched.length === 1 ? 'matches' : 'match';
  return {
    code: 'pragma-unused',
    message: `${site}; it names ${named}, which ${verb} no check in it.`,
    remedy: composeIdRemedy(unmatched, checkIds),
  };
}

// endregion | Helpers
