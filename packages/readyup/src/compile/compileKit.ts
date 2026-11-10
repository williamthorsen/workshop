import path from 'node:path';

import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { writeError } from '../output/writeError.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { writeWarnings } from '../output/writeWarnings.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import type { JsonCompileKitEntry } from '../schemas/compileOutputSchema.ts';
import { buildManifestKit, deriveClosureFields, detectDrift } from './compile-manifest.ts';
import { formatDriftLine, formatDriftReason, formatResultLine } from './compile-report.ts';
import { compileConfig } from './compileConfig.ts';
import { listDirectoryDependenceWarnings } from './listDirectoryDependenceWarnings.ts';
import { listInlinedJsonWarnings } from './listInlinedJsonWarnings.ts';

/** Compiles one kit behind the drift gate, reports it, and returns its manifest entry, JSON entry, and warnings. */
export async function compileKit(args: CompileKitArgs): Promise<SourceOutcome> {
  const {
    describeFailure,
    displayInput,
    existingKit,
    failureSubject,
    formatOutput,
    inputPath,
    isJson,
    kitName,
    manifestDir,
    outputPath,
    project,
    resolvedInputPath,
    shouldForce,
    shouldSkipManifest,
  } = args;
  const projectField = project === undefined ? {} : { project };

  const drift = detectDrift({ shouldSkipManifest, shouldForce, existingKit, manifestDir });
  if (drift !== undefined) {
    writeHuman(formatDriftLine(displayInput, drift.status), isJson);
    return {
      entry: drift.existingKit,
      kit: { name: kitName, ...projectField, status: 'skipped', error: formatDriftReason(drift.status) },
      warnings: [],
    };
  }

  let result;
  try {
    result = await compileConfig(inputPath, outputPath);
  } catch (error: unknown) {
    // A kit that fails to compile is a problem with the kit, not with the invocation. The kit's prior record is
    // returned so that a caller replacing the whole manifest keeps it, and it still describes the tree, because a
    // failed compile leaves the previous output in place.
    const message = describeFailure(error);
    writeError(message, failureSubject);
    return {
      entry: existingKit,
      kit: { name: kitName, ...projectField, status: 'failed', error: message },
      warnings: [],
    };
  }

  writeHuman(formatResultLine(displayInput, formatOutput(result.outputPath), result.changed), isJson);
  const warnings = [
    ...listInlinedJsonWarnings(kitName, result.inlinedJson),
    ...listDirectoryDependenceWarnings(kitName, result.metadata.directoryDependence),
  ];
  writeWarnings(warnings);

  const closure = deriveClosureFields(result.inputs, resolvedInputPath, manifestDir);
  return {
    entry: buildManifestKit(kitName, result.metadata, {
      bundledDependencies: result.bundledDependencies,
      esbuildVersion: result.esbuildVersion,
      inputs: closure.inputs,
      path: path.relative(manifestDir, path.resolve(result.outputPath)),
      source: path.relative(manifestDir, resolvedInputPath),
      sourceHash: closure.sourceHash,
      targetHash: result.targetHash,
    }),
    kit: { name: kitName, ...projectField, status: 'compiled' },
    warnings,
  };
}

/** Arguments for compiling one kit, stating what its caller decides about naming and reporting. */
export interface CompileKitArgs {
  /** Returns the message that reports a failed compile. */
  describeFailure: (error: unknown) => string;
  /** Name of the source on the drift line and the result line. */
  displayInput: string;
  existingKit: RdyManifestKit | undefined;
  /** Subject that prefixes the failure message, absent when the message names the source on its own. */
  failureSubject: string | undefined;
  /** Returns the name of the bundle on the result line, given the path to which the compile wrote it. */
  formatOutput: (outputPath: string) => string;
  /** Source path as given to `compileConfig`. */
  inputPath: string;
  isJson: boolean;
  kitName: string;
  manifestDir: string;
  /** Bundle path as given to `compileConfig`, which derives one from the source when it is absent. */
  outputPath: string | undefined;
  /** The project named on the kit's JSON entry, given by a recursive compile alone. */
  project: string | undefined;
  /** Absolute source path, from which the closure is read and against which the manifest records the source. */
  resolvedInputPath: string;
  shouldForce: boolean;
  shouldSkipManifest: boolean;
}

/** One kit's contribution to its compile. */
export interface SourceOutcome {
  /** The manifest entry recording the kit, absent for a kit that failed before it was ever recorded. */
  entry: RdyManifestKit | undefined;
  kit: JsonCompileKitEntry;
  warnings: RaisedWarning[];
}
