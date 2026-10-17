import { existsSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { pluralizeWithCount } from '@williamthorsen/toolbelt.strings';

import { DEFAULT_CONFIG } from '../config/loadConfig.ts';
import { MissingChecklistsError } from '../kits/MissingChecklistsError.ts';
import { getLayout } from '../layout/engine.ts';
import type { JsonCompileKitEntry, JsonCompileRemovedEntry } from '../schemas/compileOutputSchema.ts';
import type { DriftStatus } from '../verify/checkDrift.ts';

/** Clause explaining why a bundle is an orphan, shared by its human line and its JSON reason. */
export const NO_SOURCE_CLAUSE = 'no source compiles to it';

/** Separator between a compiled kit's source and its output. ASCII, so its width is two cells everywhere. */
const TRANSFORM_ARROW = '->';

/** What reporting a sweep's orphans contributes to the project's outcome. */
export interface OrphanReport {
  failedCount: number;
  kits: JsonCompileKitEntry[];
  removed: JsonCompileRemovedEntry[];
  skippedCount: number;
}

/** Arguments for the line reporting a sweep that found no sources. */
export interface EmptySweepLineArgs {
  /** Directory against which the line names the source directory. */
  displayRoot: string;
  /** The clause naming what became of the manifest, which may be empty. */
  manifestOutcome: string;
  srcDir: string;
  srcDirExists: boolean;
}

/** Counts of the kits that a sweep left out of line with their sources. */
export interface SweepTally {
  /** Kits whose source failed to compile. */
  compileFailedCount: number;
  /** Every kit that the sweep reported on, orphans included. */
  kitCount: number;
  orphanReport: OrphanReport;
  /** Kits with a source whose bundle had drifted. */
  sourcedSkippedCount: number;
}

/** Kinds of kit among those that a sweep left alone because their bundles drifted. */
export interface DriftedKitKinds {
  /** A kit that no source compiles to any longer. */
  hasOrphan: boolean;
  /** A kit compiled from a source that the sweep found. */
  hasSourced: boolean;
}

/** Returns a drift skip described for the JSON payload, which has no formatted line to read. */
export function formatDriftReason(status: Extract<DriftStatus, { kind: 'drift' }>): string {
  return `Compiled output has drifted from the manifest (expected ${status.expected}, got ${status.actual})`;
}

/** Returns the line reporting a sweep that found no sources, and why it found none. */
export function formatEmptySweepLine({
  displayRoot,
  manifestOutcome,
  srcDir,
  srcDirExists,
}: EmptySweepLineArgs): string {
  const relSrc = path.relative(displayRoot, srcDir);
  const reason = srcDirExists ? `No .ts files found in ${relSrc}` : `Source directory not found: ${relSrc}`;
  return `${reason}${manifestOutcome}\n`;
}

/** Returns the next step for a project without kit sources: `rdy init` when it can scaffold into `srcDir`. */
export function buildNoSourcesHint(projectDir: string, srcDir: string): string {
  if (srcDir === path.resolve(projectDir, DEFAULT_CONFIG.compile.srcDir)) return 'Run `rdy init` to scaffold a kit.';
  return `Add a kit source to ${path.relative(projectDir, srcDir)}.`;
}

/** Returns the label heading a sweep, naming its directories against `anchor`. */
export function formatSweepLabel(anchor: string, srcDir: string, outDir: string): string {
  const relSrcDir = path.relative(anchor, srcDir);
  if (srcDir === outDir) return `Compiling kits in ${relSrcDir}`;
  return `Compiling kits from ${relSrcDir} to ${path.relative(anchor, outDir)}`;
}

/** Returns the lines closing a sweep, one per kind of problem that it left, or an empty string when it left none. */
export function formatSweepTally(tally: SweepTally): string {
  const { compileFailedCount, orphanReport, sourcedSkippedCount } = tally;
  const kits = pluralizeWithCount(tally.kitCount, 'kit');
  const lines: string[] = [];

  const skippedCount = sourcedSkippedCount + orphanReport.skippedCount;
  if (skippedCount > 0) {
    const remedy = formatDriftRemedy({ hasOrphan: orphanReport.skippedCount > 0, hasSourced: sourcedSkippedCount > 0 });
    lines.push(`\n${skippedCount} of ${kits} skipped due to drift. ${remedy}\n`);
  }

  if (compileFailedCount > 0) {
    lines.push(`\n${compileFailedCount} of ${kits} failed to compile.\n`);
  }

  if (orphanReport.failedCount > 0) {
    lines.push(`\n${orphanReport.failedCount} of ${kits} could not be removed.\n`);
  }

  return lines.join('');
}

/** Returns a source's path as a failure names it: against the sweep root in a recursive compile, else against `srcDir`. */
export function describeSource(fileName: string, srcDir: string, sweepRoot: string | undefined): string {
  return sweepRoot === undefined ? fileName : path.relative(sweepRoot, path.join(srcDir, fileName));
}

/**
 * Returns why a source of a sweep failed to compile, naming `compile.exclude` when the source is not a kit, because a
 * module that the kits share is swept with them unless the config excludes it.
 */
export function describeSweepFailure(error: unknown): string {
  const message = describeError(error);
  if (!(error instanceof MissingChecklistsError)) return message;
  return `${message}. A module that the kits share is not a kit: Keep it out of the sweep with \`compile.exclude\`.`;
}

/** Returns a line naming the output that a rebuilt kit produced, or reporting an unchanged one as skipped. */
export function formatResultLine(srcName: string, outName: string, changed: boolean): string {
  if (!changed) {
    return getLayout().formatCheckLine({ token: 'skippedOptional', name: srcName, detail: 'no changes' }) + '\n';
  }

  const claim = getLayout().formatCheckLine({ token: 'passed', name: srcName });
  return `${claim} ${TRANSFORM_ARROW} ${getLayout().inlineGlyph('kit')}${outName}\n`;
}

/** Returns a warning line for a kit, with the hash mismatch from `status` and any further `clause` in a block beneath. */
export function formatDriftLine(
  name: string,
  status: Extract<DriftStatus, { kind: 'drift' }>,
  clause?: string,
): string {
  const target = path.basename(status.resolvedPath);
  const claim = getLayout().formatCheckLine({ token: 'failedWarn', name });
  const mismatch = `drift in ${target}: expected ${status.expected}, got ${status.actual}`;
  const reason = clause === undefined ? mismatch : `${mismatch}; ${clause}`;

  return [claim, ...getLayout().formatReasonBlock([reason])].join('\n') + '\n';
}

/** Returns what to do about a sweep's drifted kits. An orphan has no source into which to move its edits. */
export function formatDriftRemedy({ hasOrphan, hasSourced }: DriftedKitKinds): string {
  if (!hasOrphan) return 'Re-run with --force to overwrite, or move edits into the source.';
  if (!hasSourced) return 'Re-run with --force to remove, or restore the source.';
  return 'Re-run with --force to overwrite or remove, or move edits into the source.';
}

/** Returns a line reporting a bundle removed because no source compiles to it. */
export function formatRemovalLine(bundleName: string): string {
  return (
    getLayout().formatCheckLine({ token: 'passed', name: bundleName, detail: `removed, ${NO_SOURCE_CLAUSE}` }) + '\n'
  );
}

/** Returns a section heading as a single writable string, newline-terminated. */
export function formatSectionHeading(label: string): string {
  return `${getLayout().formatHeading(label, 'section')}\n`;
}

/**
 * Returns the clause naming what a sweep that found no kits did with the manifest.
 *
 * Empty under `--skip-manifest`, because the run never consulted the manifest and has nothing to report about it. A written
 * manifest lists no kits unless an orphan kept its entry.
 */
export function formatManifestOutcome(skipManifest: boolean, writesManifest: boolean, entryCount: number): string {
  if (skipManifest) return '';
  if (!writesManifest) return '; manifest not written';
  return `; manifest now lists ${entryCount === 0 ? 'no kits' : pluralizeWithCount(entryCount, 'kit')}`;
}

/**
 * Returns the directory against which a compile heading names its paths.
 *
 * The nearest enclosing workspace root takes precedence, then the nearest repository root, then `fallbackDir`.
 * `pnpm -r exec rdy compile` gives each workspace its own working directory, so naming paths against
 * that one would give every workspace's output the same heading and leave the reader unable to tell whose
 * kits a line reports. A repository with no workspace file still gets a stable anchor.
 */
export function resolveWorkspaceAnchor(srcDir: string, fallbackDir: string): string {
  const markers = ['pnpm-workspace.yaml', '.git'];

  for (const marker of markers) {
    let directory = srcDir;
    while (directory !== path.dirname(directory)) {
      if (existsSync(path.join(directory, marker))) return directory;
      directory = path.dirname(directory);
    }
  }

  return fallbackDir;
}
