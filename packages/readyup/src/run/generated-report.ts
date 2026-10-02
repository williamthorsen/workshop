import path from 'node:path';
import process from 'node:process';

import { runGit } from '../check-utils/git/run-git.ts';
import { listForeignPaths } from '../check-utils/project/listForeignPaths.ts';
import { listTrackedFiles } from '../check-utils/project/listTrackedFiles.ts';
import { isSweepExcluded, readSourceText } from '../check-utils/project/readTrackedSources.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import { type BundlerSignal, detectBundlerOutput, MEAN_LINE_LENGTH_THRESHOLD } from './detectBundlerOutput.ts';
import { isJsFamilyPath } from './listPragmaSites.ts';
import type { PragmaLedger } from './PragmaLedger.ts';

/** One examined source that looks like bundler output and that the project has not marked as generated. */
interface UnmarkedSource {
  /** The path relative to `cwd`, the form in which findings print. */
  displayPath: string;

  /** The path relative to the repository root, the form that a root `.gitattributes` pattern takes. */
  rootPath: string;

  signal: BundlerSignal;
}

/** What each signal is reported as, completing "looks like bundler output". */
const SIGNAL_EVIDENCE: Record<BundlerSignal, string> = {
  density: `its mean line length exceeds ${MEAN_LINE_LENGTH_THRESHOLD} characters`,
  header: "its opening lines contain a bundler's runtime helpers or an @generated marker",
};

/**
 * Emits an advisory stderr warning for each examined source that looks like bundler output while the project has
 * not marked it `linguist-generated` or `linguist-vendored`, and returns the entries.
 *
 * The evidence is what the run's checks read, as for the unused-pragma report: Only a tracked JS-family source that
 * some check examined is judged, and a file outside every sweep is left alone. The warning advises and excludes
 * nothing, so a flagged file stays in every sweep until the project marks it.
 *
 * The report is advisory, so a git failure while resolving the candidates yields no warning rather than failing
 * the run. The stderr lines are written in both output modes, and the returned entries are what JSON mode
 * captures into the report.
 */
export async function warnOnUnmarkedGeneratedSources(ledger: PragmaLedger): Promise<RaisedWarning[]> {
  const unmarked = (await listUnmarkedSources(ledger)).toSorted(byDisplayPath);

  const warnings = unmarked.map((source) => toWarning(source));
  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  }
  return warnings;
}

// region | Helpers

/** Orders two sources by the path printed for them. */
function byDisplayPath(a: UnmarkedSource, b: UnmarkedSource): number {
  if (a.displayPath === b.displayPath) return 0;
  return a.displayPath < b.displayPath ? -1 : 1;
}

/**
 * Writes a path as a `.gitattributes` pattern that matches that file alone.
 *
 * The leading `/` anchors the pattern to the root, which a pattern without a slash otherwise is not, and keeps it
 * from opening with `#` or `!`. Glob metacharacters are escaped first, then a path that a bare pattern cannot hold
 * is C-quoted, because git unquotes a quoted pattern before reading its glob escapes.
 */
function formatAttributePattern(rootPath: string): string {
  const pattern = `/${rootPath.replaceAll(/[*?[\\]/g, String.raw`\$&`)}`;

  // Iterate by code point, so that a character outside the BMP is copied whole rather than split into surrogates.
  let quoted = '';
  let needsQuotes = false;
  for (const character of pattern) {
    needsQuotes ||= needsQuoting(character);
    quoted += quoteCharacter(character);
  }

  return needsQuotes ? `"${quoted}"` : pattern;
}

/** Returns the examined sources that look like bundler output and that the project has not marked. */
async function listUnmarkedSources(ledger: PragmaLedger): Promise<UnmarkedSource[]> {
  const cwd = process.cwd();
  const examined = ledger
    .scannedPaths()
    .map((scannedPath) => path.relative(cwd, scannedPath))
    .filter((displayPath) => isJsFamilyPath(displayPath) && !isSweepExcluded(displayPath));
  if (examined.length === 0) return [];

  let candidates: { foreign: ReadonlySet<string>; prefix: string; tracked: ReadonlySet<string> };
  try {
    const tracked = await listTrackedFiles();
    if (tracked === undefined) return [];
    candidates = {
      foreign: await listForeignPaths(),
      prefix: await runGit(cwd, 'rev-parse', '--show-prefix'),
      tracked: new Set(tracked),
    };
  } catch {
    return [];
  }

  const unmarked: UnmarkedSource[] = [];
  for (const displayPath of examined) {
    if (!candidates.tracked.has(displayPath) || candidates.foreign.has(displayPath)) continue;

    const text = readSourceText(displayPath);
    if (text === undefined) continue;

    const signal = detectBundlerOutput(text);
    if (signal !== undefined) {
      unmarked.push({ displayPath, rootPath: `${candidates.prefix}${displayPath}`, signal });
    }
  }

  return unmarked;
}

/** Reports whether a character is a C0 control character, which a quoted pattern writes as an escape. */
function isControlCharacter(character: string): boolean {
  return (character.codePointAt(0) ?? 0) < 0x20;
}

/** Reports whether a character cannot appear in an unquoted `.gitattributes` pattern. */
function needsQuoting(character: string): boolean {
  return character === '"' || /\s/.test(character) || isControlCharacter(character);
}

/** Returns a character as a C-quoted pattern writes it, in the form that git unquotes. */
function quoteCharacter(character: string): string {
  switch (character) {
    case '"':
      return String.raw`\"`;
    case '\\':
      return String.raw`\\`;
    case '\t':
      return String.raw`\t`;
    case '\n':
      return String.raw`\n`;
    case '\r':
      return String.raw`\r`;
    default:
      return isControlCharacter(character)
        ? `\\${(character.codePointAt(0) ?? 0).toString(8).padStart(3, '0')}`
        : character;
  }
}

/** Composes the warning raised by one unmarked source. */
function toWarning(source: UnmarkedSource): RaisedWarning {
  return {
    code: 'generated-unmarked',
    message: `${source.displayPath} looks like bundler output (${SIGNAL_EVIDENCE[source.signal]}) and is not marked as generated.`,
    remedy: `Add \`${formatAttributePattern(source.rootPath)} linguist-generated=true\` to .gitattributes, so that kits stop sweeping it.`,
  };
}

// endregion | Helpers
