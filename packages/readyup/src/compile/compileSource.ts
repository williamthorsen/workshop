import path from 'node:path';
import process from 'node:process';

import { deriveKitName } from '../kits/deriveKitName.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { writeHuman } from '../output/writeHuman.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import type { JsonCompileKitEntry } from '../schemas/compileOutputSchema.ts';
import { buildManifestKit, deriveClosureFields, detectDrift } from './compile-manifest.ts';
import {
  describeSource,
  describeSweepFailure,
  formatDriftLine,
  formatDriftReason,
  formatResultLine,
} from './compile-report.ts';
import { compileConfig } from './compileConfig.ts';
import { deriveJsPath } from './deriveJsPath.ts';
import { warnOnDirectoryDependentChecks } from './warnOnDirectoryDependentChecks.ts';
import { warnOnInlinedJson } from './warnOnInlinedJson.ts';

/** What a project sweep shares with each of its sources. */
export interface SourceSweepContext {
  existingKitsByName: Map<string, RdyManifestKit>;
  force: boolean;
  json: boolean;
  manifestDir: string;
  outDir: string;
  /** The project named on the kit's JSON entry, given by a recursive compile alone. */
  project: string | undefined;
  skipManifest: boolean;
  srcDir: string;
  /** Directory against which a failed source is named, given by a recursive compile alone. */
  sweepRoot: string | undefined;
}

/** One source's contribution to its project's compile. */
export interface SourceOutcome {
  /** The manifest entry recording the kit, absent for a kit that failed before it was ever recorded. */
  entry: RdyManifestKit | undefined;
  kit: JsonCompileKitEntry;
  warnings: RaisedWarning[];
}

/** Compiles one source of a project sweep behind the drift gate, and returns its contribution to the project. */
export async function compileSource(fileName: string, context: SourceSweepContext): Promise<SourceOutcome> {
  const { existingKitsByName, force, json, manifestDir, outDir, project, skipManifest, srcDir, sweepRoot } = context;
  const projectField = project === undefined ? {} : { project };
  const srcFile = path.join(srcDir, fileName);
  const outName = deriveJsPath(fileName);
  const outFile = path.join(outDir, outName);
  const kitName = deriveKitName(fileName, '.ts');
  const existingKit = existingKitsByName.get(kitName);

  const drift = detectDrift({ skipManifest, force, existingKit, manifestDir });
  if (drift !== undefined) {
    writeHuman(formatDriftLine(fileName, drift.status), json);
    return {
      entry: drift.existingKit,
      kit: { name: kitName, ...projectField, status: 'skipped', error: formatDriftReason(drift.status) },
      warnings: [],
    };
  }

  try {
    const result = await compileConfig(srcFile, outFile);
    writeHuman(formatResultLine(fileName, outName, result.changed), json);

    const closure = deriveClosureFields(result.inputs, path.resolve(srcFile), manifestDir);
    return {
      entry: buildManifestKit(kitName, result.metadata, {
        bundledDependencies: result.bundledDependencies,
        esbuildVersion: result.esbuildVersion,
        inputs: closure.inputs,
        path: path.relative(manifestDir, path.resolve(result.outputPath)),
        source: path.relative(manifestDir, srcFile),
        sourceHash: closure.sourceHash,
        targetHash: result.targetHash,
      }),
      kit: { name: kitName, ...projectField, status: 'compiled' },
      warnings: [
        ...warnOnInlinedJson(kitName, result.inlinedJson),
        ...warnOnDirectoryDependentChecks(kitName, result.metadata.directoryDependence),
      ],
    };
  } catch (error: unknown) {
    // A kit that fails to compile is a problem with the kit, not with the invocation, so the sweep
    // goes on. Because the sweep replaces the whole manifest, this returns the kit's prior record to keep it
    // there. That record still describes the tree, because a failed compile leaves the previous output in place.
    const message = describeSweepFailure(error);
    process.stderr.write(`Error compiling ${describeSource(fileName, srcDir, sweepRoot)}: ${message}\n`);
    return {
      entry: existingKit,
      kit: { name: kitName, ...projectField, status: 'failed', error: message },
      warnings: [],
    };
  }
}
