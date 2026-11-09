import path from 'node:path';

import { deriveKitName } from '../kits/deriveKitName.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { describeSource, describeSweepFailure } from './compile-report.ts';
import { compileKit, type SourceOutcome } from './compileKit.ts';
import { deriveJsPath } from './deriveJsPath.ts';

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

/** Compiles one source of a project sweep, naming it and its bundle by their places in the sweep's directories. */
export async function compileSource(fileName: string, context: SourceSweepContext): Promise<SourceOutcome> {
  const { existingKitsByName, force, json, manifestDir, outDir, project, skipManifest, srcDir, sweepRoot } = context;
  const srcFile = path.join(srcDir, fileName);
  const outName = deriveJsPath(fileName);
  const kitName = deriveKitName(fileName, '.ts');

  return compileKit({
    describeFailure: describeSweepFailure,
    displayInput: fileName,
    existingKit: existingKitsByName.get(kitName),
    failureSubject: `cannot compile ${describeSource(fileName, srcDir, sweepRoot)}`,
    force,
    formatOutput: () => outName,
    inputPath: srcFile,
    json,
    kitName,
    manifestDir,
    outputPath: path.join(outDir, outName),
    project,
    resolvedInputPath: path.resolve(srcFile),
    skipManifest,
  });
}
