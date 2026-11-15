import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { internalError } from '../errors/RdyError.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestInput, RdyManifestKit } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { writeManifest } from '../manifest/writeManifest.ts';
import { toDisplayPath } from '../portable/toDisplayPath.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import { checkDrift, type DriftStatus } from '../verify/checkDrift.ts';
import { VERSION } from '../version.ts';
import type { CompiledInput } from './CompiledInput.ts';
import type { KitMetadata } from './validateCompiledOutput.ts';

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

/** The manifest fields supplied by a compile's input closure. */
export interface ClosureFields {
  inputs: RdyManifestInput[];
  sourceHash: string;
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

/**
 * Returns a single kit's drift status alongside the manifest entry to preserve, or `undefined` when
 * the kit should proceed to compile.
 */
export function detectDrift(args: DetectDriftArgs): DriftSkip | undefined {
  const { shouldSkipManifest, shouldForce, existingKit, manifestDir } = args;
  if (shouldSkipManifest || shouldForce || existingKit === undefined) return undefined;
  const status = checkDrift(existingKit, manifestDir);
  if (status.kind !== 'drift') return undefined;
  return { status, existingKit };
}

/** Arguments for the per-kit drift-detection helper. */
export interface DetectDriftArgs {
  shouldSkipManifest: boolean;
  shouldForce: boolean;
  existingKit: RdyManifestKit | undefined;
  manifestDir: string;
}

/** Materialized skip decision: the drift status to report plus the manifest entry to preserve. */
export interface DriftSkip {
  status: Extract<DriftStatus, { kind: 'drift' }>;
  existingKit: RdyManifestKit;
}

/** The kits that an existing manifest records, indexed by name, and the warning raised when it cannot be read. */
export interface ExistingManifest {
  kitsByName: Map<string, RdyManifestKit>;
  warnings: RaisedWarning[];
}

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

/**
 * Returns the manifest's kits indexed by name, or an empty index when the manifest is missing.
 *
 * A missing manifest is the normal state of a first compile. Any other failure leaves the index empty and is returned
 * as a `manifest-unreadable` warning, which ends with `remedy` when the caller gives one.
 */
export function loadExistingManifest(manifestPath: string, remedy?: string): ExistingManifest {
  const kitsByName = new Map<string, RdyManifestKit>();
  try {
    const manifest = readManifest(manifestPath);
    for (const kit of manifest.kits) {
      kitsByName.set(kit.name, kit);
    }
  } catch (error: unknown) {
    if (!(error instanceof ManifestNotFoundError)) {
      return { kitsByName, warnings: [toUnreadableManifestWarning(manifestPath, error, remedy)] };
    }
  }
  return { kitsByName, warnings: [] };
}

/** Returns the manifest output path, taken from `--manifest` when that flag was given. */
export function resolveManifestPath(flagValue: string | undefined): string {
  return path.resolve(process.cwd(), flagValue ?? DEFAULT_MANIFEST_PATH);
}

/** Replaces the entry among `existingKits` for the kit that `entry` records, or adds it, and writes the manifest. */
export function upsertManifest(
  manifestPath: string,
  existingKits: Iterable<RdyManifestKit>,
  entry: RdyManifestKit,
): void {
  const filtered = [...existingKits].filter((k) => k.name !== entry.name);
  const kits = [...filtered, entry].toSorted((a, b) => a.name.localeCompare(b.name));

  writeManifest(manifestPath, { version: 1, kits });
}

// region | Helpers

/** Returns a recorded input with its path stated relative to the manifest directory, as `path` and `source` are. */
function relativizeInput(input: CompiledInput, manifestDir: string): RdyManifestInput {
  const relativePath = path.relative(manifestDir, input.path);

  return input.kind === 'inline'
    ? { hash: input.hash, kind: 'inline', path: relativePath, paths: input.paths }
    : { hash: input.hash, kind: 'module', path: relativePath };
}

/** Builds the advisory for a manifest that is present and unreadable. */
function toUnreadableManifestWarning(manifestPath: string, error: unknown, remedy: string | undefined): RaisedWarning {
  return {
    code: 'manifest-unreadable',
    message: `${toDisplayPath(manifestPath)} could not be read, so no kit was checked for drift against it, and any manifest that this compile writes records only the kits that it compiles: ${describeError(error)}`,
    ...(remedy !== undefined && { remedy }),
  };
}

// endregion | Helpers
