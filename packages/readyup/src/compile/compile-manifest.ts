import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { internalError } from '../errors/RdyError.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestInput, RdyManifestKit } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { writeManifest } from '../manifest/writeManifest.ts';
import { checkDrift, type DriftStatus } from '../verify/checkDrift.ts';
import { VERSION } from '../version.ts';
import type { CompiledInput } from './CompiledInput.ts';
import type { KitMetadata } from './validateCompiledOutput.ts';

/** The fields that a compile supplies to a manifest kit entry, with paths stated against the manifest. */
export interface KitCompileFields {
  bundledDependencies: Record<string, string>;
  esbuildVersion: string;
  inputs: RdyManifestInput[];
  path: string;
  source: string;
  sourceHash: string;
  targetHash: string;
}

/** The manifest fields supplied by a compile's input closure. */
export interface ClosureFields {
  inputs: RdyManifestInput[];
  sourceHash: string;
}

/** Arguments for the per-kit drift-detection helper. */
export interface DetectDriftArgs {
  skipManifest: boolean;
  force: boolean;
  existingKit: RdyManifestKit | undefined;
  manifestDir: string;
}

/** Materialized skip decision: the drift status to report plus the manifest entry to preserve. */
export interface DriftSkip {
  status: Extract<DriftStatus, { kind: 'drift' }>;
  existingKit: RdyManifestKit;
}

/** Returns the manifest output path, taken from `--manifest` when that flag was given. */
export function resolveManifestPath(flagValue: string | undefined): string {
  return path.resolve(process.cwd(), flagValue ?? DEFAULT_MANIFEST_PATH);
}

/**
 * Returns the manifest fields supplied by a compile's closure, with paths stated against the manifest.
 *
 * `sourceHash` is the entry's own record rather than a second reading of the file, so the two cannot
 * disagree. A closure with no record of the entry is a defect in rdy rather than an occasion to hash
 * the file again: Deriving is the point, and hashing separately would restore exactly the disagreement
 * that deriving prevents.
 *
 * The entry is matched by its real path, because esbuild reports the path to which it resolved a module,
 * which differs from the path passed to a compile wherever a directory above it is a symlink.
 */
export function deriveClosureFields(inputs: CompiledInput[], entryPath: string, manifestDir: string): ClosureFields {
  const realEntryPath = realpathSync(entryPath);
  const entry = inputs.find((input) => input.kind === 'module' && input.path === realEntryPath);
  if (entry === undefined) {
    throw internalError(`Compile recorded no input for its entry point ${entryPath}`);
  }

  return {
    inputs: inputs.map((input) => relativizeInput(input, manifestDir)),
    sourceHash: entry.hash,
  };
}

/** Returns the manifest entry recording a compiled kit, omitting each optional field that it has nothing for. */
export function buildManifestKit(
  kitName: string,
  metadata: KitMetadata,
  compileFields: KitCompileFields,
): RdyManifestKit {
  return {
    esbuildVersion: compileFields.esbuildVersion,
    inputs: compileFields.inputs,
    name: kitName,
    path: compileFields.path,
    readyupVersion: VERSION,
    source: compileFields.source,
    sourceHash: compileFields.sourceHash,
    targetHash: compileFields.targetHash,
    ...(Object.keys(compileFields.bundledDependencies).length > 0 && {
      bundledDependencies: compileFields.bundledDependencies,
    }),
    ...(metadata.checklists.length > 0 && {
      checklistChecks: metadata.checklistChecks,
      checklists: metadata.checklists,
    }),
    ...(metadata.description !== undefined && { description: metadata.description }),
  };
}

/** Upserts a kit entry into the manifest at `manifestPath`, writing the result back. */
export function upsertManifest(
  manifestPath: string,
  kitName: string,
  metadata: KitMetadata,
  compileFields: KitCompileFields,
): void {
  let existingKits: RdyManifestKit[] = [];
  try {
    const existing = readManifest(manifestPath);
    existingKits = existing.kits;
  } catch (error: unknown) {
    // Missing manifest is expected for first compile; other failures should be reported.
    if (!(error instanceof ManifestNotFoundError)) {
      const message = describeError(error);
      process.stderr.write(`Warning: ${message}; starting with empty manifest\n`);
    }
  }

  const entry = buildManifestKit(kitName, metadata, compileFields);

  // Replace existing entry for this kit name, or append.
  const filtered = existingKits.filter((k) => k.name !== kitName);
  const kits = [...filtered, entry].toSorted((a, b) => a.name.localeCompare(b.name));

  writeManifest(manifestPath, { version: 1, kits });
}

/**
 * Returns the manifest's kits indexed by name, or an empty index when the manifest is missing.
 *
 * A missing manifest is the normal state of a first compile. Any other failure is written to stderr
 * and leaves the drift gate a no-op.
 */
export function loadExistingKitsByName(manifestPath: string): Map<string, RdyManifestKit> {
  const map = new Map<string, RdyManifestKit>();
  try {
    const manifest = readManifest(manifestPath);
    for (const kit of manifest.kits) {
      map.set(kit.name, kit);
    }
  } catch (error: unknown) {
    if (!(error instanceof ManifestNotFoundError)) {
      const message = describeError(error);
      process.stderr.write(`Warning: ${message}; drift gate skipped\n`);
    }
  }
  return map;
}

/**
 * Returns a single kit's drift status alongside the manifest entry to preserve, or `undefined` when
 * the kit should proceed to compile.
 */
export function detectDrift(args: DetectDriftArgs): DriftSkip | undefined {
  const { skipManifest, force, existingKit, manifestDir } = args;
  if (skipManifest || force || existingKit === undefined) return undefined;
  const status = checkDrift(existingKit, manifestDir);
  if (status.kind !== 'drift') return undefined;
  return { status, existingKit };
}

// region | Helpers

/** Returns a recorded input with its path stated relative to the manifest directory, as `path` and `source` are. */
function relativizeInput(input: CompiledInput, manifestDir: string): RdyManifestInput {
  const relativePath = path.relative(manifestDir, input.path);

  return input.kind === 'inline'
    ? { hash: input.hash, kind: 'inline', path: relativePath, paths: input.paths }
    : { hash: input.hash, kind: 'module', path: relativePath };
}

// endregion | Helpers
