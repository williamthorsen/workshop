import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { configError } from '../errors/RdyError.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { writeManifest } from '../manifest/writeManifest.ts';
import { writeHuman } from '../output/writeHuman.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import { collectSourceFiles } from './collectSourceFiles.ts';
import { loadExistingKitsByName } from './compile-manifest.ts';
import type { ProjectCompileOutcome } from './compile-outcome.ts';
import {
  buildNoSourcesHint,
  formatDriftLine,
  formatDriftReason,
  formatEmptySweepLine,
  formatManifestOutcome,
  formatRemovalLine,
  formatSectionHeading,
  formatSweepLabel,
  formatSweepTally,
  NO_SOURCE_CLAUSE,
  type OrphanReport,
  resolveWorkspaceAnchor,
} from './compile-report.ts';
import { compileSource, type SourceOutcome, type SourceSweepContext } from './compileSource.ts';
import { deriveJsPath } from './deriveJsPath.ts';
import { type OrphanOutcome, pruneOrphanedEntries } from './pruneOrphanedEntries.ts';
import { warnOnUnrecordedBundles, type WarnOnUnrecordedBundlesArgs } from './warnOnUnrecordedBundles.ts';

/** Arguments for compiling one project's kit sources. */
export interface CompileProjectArgs {
  /** Directory against which the config's `srcDir` and `outDir` resolve. */
  projectDir: string;
  config: ResolvedRdyConfig;
  manifestPath: string;
  force: boolean;
  skipManifest: boolean;
  json: boolean;
  /** The recursive compile that the project belongs to, which names every path against its root. */
  sweep?: SweepContext;
}

/** A project's location in a recursive compile. */
export interface SweepContext {
  /** Directory from which the sweep descended. */
  root: string;
  /** The project's directory relative to `root`, as discovery reports it. */
  project: string;
}

/**
 * Compiles every matching `.ts` file in a project's config-driven source directory, prunes the bundles of kits that
 * no source compiles to any longer, and returns what became of each kit.
 *
 * The sweep runs to completion: A kit that fails to compile is reported and the next one is tried,
 * so that one broken kit cannot hide the state of every kit that sorts after it. Failures on the way to
 * the sweep -- an unreadable source directory, an unwritable manifest -- still throw, because they say
 * nothing about any individual kit.
 *
 * A sweep that finds no sources still prunes, and writes the manifest only when one exists: That manifest may list
 * kits since deleted, and the sweep seeds no manifest for a project with neither kits nor a manifest.
 */
export async function compileProject(args: CompileProjectArgs): Promise<ProjectCompileOutcome> {
  const { projectDir, config, manifestPath, force, skipManifest, json, sweep } = args;

  const srcDir = path.resolve(projectDir, config.compile.srcDir);
  const outDir = path.resolve(projectDir, config.compile.outDir);

  // A missing source directory is treated as an empty one rather than as an error.
  const srcDirExists = existsSync(srcDir);

  let tsFiles: string[] = [];
  if (srcDirExists) {
    try {
      tsFiles = collectSourceFiles(srcDir, config.compile);
    } catch (error: unknown) {
      throw configError(`Failed to read source directory: ${describeError(error)}`, { cause: error });
    }
  }

  const isEmptySweep = tsFiles.length === 0;
  if (!isEmptySweep) {
    const anchor = sweep?.root ?? resolveWorkspaceAnchor(srcDir, projectDir);
    writeHuman(formatSectionHeading(formatSweepLabel(anchor, srcDir, outDir)), json);
  }

  const manifestDir = path.dirname(manifestPath);
  const existingKitsByName = skipManifest ? new Map<string, RdyManifestKit>() : loadExistingKitsByName(manifestPath);
  const sourceContext: SourceSweepContext = {
    existingKitsByName,
    force,
    json,
    manifestDir,
    outDir,
    project: sweep?.project,
    skipManifest,
    srcDir,
    sweepRoot: sweep?.root,
  };

  const sources: SourceOutcome[] = [];
  for (const fileName of tsFiles) {
    sources.push(await compileSource(fileName, sourceContext));
  }

  const kitEntries = sources.flatMap((source) => (source.entry === undefined ? [] : [source.entry]));
  const kitResults = sources.map((source) => source.kit);
  const warnings = sources.flatMap((source) => source.warnings);
  const skippedCount = kitResults.filter((kit) => kit.status === 'skipped').length;
  const failedCount = kitResults.filter((kit) => kit.status === 'failed').length;

  const sweptKitNames = new Set(kitResults.map((kit) => kit.name));
  const sweptBundlePaths = new Set(tsFiles.map((fileName) => path.join(outDir, deriveJsPath(fileName))));
  const pruned = pruneOrphanedEntries({
    existingEntries: existingKitsByName.values(),
    force,
    manifestDir,
    outDir,
    sweptBundlePaths,
    sweptKitNames,
  });
  kitEntries.push(...pruned.keptEntries);
  const writesManifest = !skipManifest && (!isEmptySweep || existsSync(manifestPath));

  const hint = isEmptySweep
    ? reportEmptySweep({
        entryCount: kitEntries.length,
        json,
        manifestPath,
        projectDir,
        skipManifest,
        srcDir,
        srcDirExists,
        sweep,
        writesManifest,
      })
    : undefined;

  const orphanReport = reportOrphans(pruned.orphans, { json, outDir, project: sweep?.project });
  kitResults.push(...orphanReport.kits);

  // A run that reads no manifest cannot tell a recorded bundle from an unrecorded one.
  if (!skipManifest) {
    warnings.push(...warnOnSweepBundles({ entries: kitEntries, manifestDir, outDir, sweptKitNames }));
  }

  const tally = formatSweepTally({
    compileFailedCount: failedCount,
    kitCount: tsFiles.length + pruned.orphans.length,
    orphanReport,
    sourcedSkippedCount: skippedCount,
  });
  if (tally !== '') writeHuman(tally, json);

  if (writesManifest) {
    try {
      kitEntries.sort((a, b) => a.name.localeCompare(b.name));
      writeManifest(manifestPath, { version: 1, kits: kitEntries });
    } catch (error: unknown) {
      throw configError(`Error writing manifest: ${describeError(error)}`, { cause: error });
    }
  }

  return { kits: kitResults, removed: orphanReport.removed, warnings, ...(hint !== undefined && { hint }) };
}

// region | Helpers

/** Arguments for reporting a sweep that found no sources. */
interface EmptySweepReportArgs {
  /** How many kits the manifest lists after the sweep. */
  entryCount: number;
  json: boolean;
  manifestPath: string;
  projectDir: string;
  skipManifest: boolean;
  srcDir: string;
  srcDirExists: boolean;
  sweep: SweepContext | undefined;
  writesManifest: boolean;
}

/** Reports a sweep that found no sources, returning the hint that it printed, if any. */
function reportEmptySweep(args: EmptySweepReportArgs): string | undefined {
  const { entryCount, json, manifestPath, projectDir, skipManifest, srcDir, srcDirExists, sweep, writesManifest } =
    args;
  const manifestOutcome = formatManifestOutcome(skipManifest, writesManifest, entryCount);
  writeHuman(
    formatEmptySweepLine({ displayRoot: sweep?.root ?? projectDir, manifestOutcome, srcDir, srcDirExists }),
    json,
  );

  // A project with a manifest was emptied deliberately, and a recursive sweep found each project by its readyup
  // footprint, so neither needs scaffolding.
  if (sweep !== undefined || existsSync(manifestPath)) return undefined;

  const hint = buildNoSourcesHint(projectDir, srcDir);
  writeHuman(`${getLayout().formatHint(hint)}\n`, json);
  return hint;
}

/** Arguments for reporting the orphans of a project compile. */
interface ReportOrphansArgs {
  json: boolean;
  /** Directory against which a bundle is named, as a source is named against the source directory. */
  outDir: string;
  /** The project named on each JSON entry, given by a recursive compile alone. */
  project: string | undefined;
}

/**
 * Writes a line for each orphan and returns its contribution to the project's outcome.
 *
 * A removed bundle is a removal rather than a kit, so it counts against nothing. A kept one is a kit whose bundle is
 * not what its manifest entry says it should be, and counts against the run as any other skipped or failed kit does.
 */
function reportOrphans(orphans: OrphanOutcome[], args: ReportOrphansArgs): OrphanReport {
  const { json, outDir, project } = args;
  const projectField = project === undefined ? {} : { project };
  const report: OrphanReport = { failedCount: 0, kits: [], removed: [], skippedCount: 0 };

  for (const orphan of orphans) {
    const { bundlePath, name } = orphan;
    const bundleName = path.relative(outDir, bundlePath);

    switch (orphan.kind) {
      case 'removed':
        writeHuman(formatRemovalLine(bundleName), json);
        report.removed.push({ name, ...projectField, path: path.relative(process.cwd(), bundlePath) });
        break;
      case 'drift':
        writeHuman(formatDriftLine(bundleName, orphan.status, NO_SOURCE_CLAUSE), json);
        report.kits.push({
          name,
          ...projectField,
          status: 'skipped',
          error: `${formatDriftReason(orphan.status)}; ${NO_SOURCE_CLAUSE}`,
        });
        report.skippedCount += 1;
        break;
      case 'failed':
        process.stderr.write(`Error removing ${path.relative(process.cwd(), bundlePath)}: ${orphan.message}\n`);
        report.kits.push({ name, ...projectField, status: 'failed', error: orphan.message });
        report.failedCount += 1;
        break;
    }
  }

  return report;
}

/**
 * Warns on the bundles of a sweep that nothing accounts for, and raises an output directory that cannot be read as a
 * config error, as an unreadable source directory is.
 */
function warnOnSweepBundles(args: WarnOnUnrecordedBundlesArgs): RaisedWarning[] {
  try {
    return warnOnUnrecordedBundles(args);
  } catch (error: unknown) {
    throw configError(`Failed to read output directory: ${describeError(error)}`, { cause: error });
  }
}

// endregion | Helpers
