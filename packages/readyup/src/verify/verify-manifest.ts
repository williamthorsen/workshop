import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { buildEsbuildInstallHint } from '../compile/buildBundle.ts';
import { collectSourceKitNames } from '../compile/collectSourceKitNames.ts';
import { loadEsbuild } from '../compile/loadEsbuild.ts';
import { loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/extractHint.ts';
import { configError } from '../errors/RdyError.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import type { JsonVerifyKitEntry, JsonVerifyUncompiledEntry } from '../schemas/verifyOutputSchema.ts';
import { checkDrift } from './checkDrift.ts';
import { checkInputDrift } from './checkInputDrift.ts';
import { checkRebuild } from './checkRebuild.ts';
import { checkSourceDrift } from './checkSourceDrift.ts';
import type { KitVerdicts } from './verdicts.ts';
import type { ManifestVerification, VerifyEvent } from './verify-events.ts';
import { buildVerifyEntry, isPassingVerdict } from './verify-report.ts';

/** The real collaborators of verification. */
export const defaultVerifyDependencies: VerifyDependencies = {
  checkDrift,
  checkInputDrift,
  checkRebuild,
  checkSourceDrift,
  loadConfig,
  loadEsbuild,
  readManifest,
};

/**
 * Returns an entry for each kit that the compile settings select and the manifest does not record, sorted by name.
 *
 * Raises a config error when the source directory exists but cannot be read.
 */
export function findUncompiledKits(args: FindUncompiledKitsArgs): JsonVerifyUncompiledEntry[] {
  const { manifest, manifestDir, srcDir, selection, project } = args;
  let names: string[];
  try {
    names = collectSourceKitNames(srcDir, selection);
  } catch (error: unknown) {
    throw configError(`Failed to read source directory: ${describeError(error)}`, { cause: error });
  }

  const recordedNames = new Set(manifest.kits.map((kit) => kit.name));
  return names
    .filter((name) => !recordedNames.has(name))
    .map((name) => ({
      name,
      ...(project !== undefined && { project }),
      source: path.relative(manifestDir, path.join(srcDir, `${name}.ts`)),
    }));
}

/** Arguments for finding the kit sources that a manifest does not record. */
export interface FindUncompiledKitsArgs {
  manifest: RdyManifest;
  manifestDir: string;
  /** Absolute path of the directory from which the compile selects sources. */
  srcDir: string;
  selection: Pick<ResolvedRdyConfig['compile'], 'exclude' | 'include'>;
  /** The project named on each entry, given by a recursive verify alone. */
  project?: string;
}

/**
 * Reads a manifest, raising a config error when it is missing, unreadable, or invalid.
 *
 * A missing manifest's hint repeats `manifestFlag`, the `--manifest` value as typed, so that the user can rerun it.
 */
export function loadManifest(
  manifestPath: string,
  manifestFlag?: string,
  dependencies: VerifyDependencies = defaultVerifyDependencies,
): RdyManifest {
  try {
    return dependencies.readManifest(manifestPath);
  } catch (error: unknown) {
    if (!(error instanceof ManifestNotFoundError)) throw error;
    const hint = `Run \`rdy compile${manifestFlag === undefined ? '' : ` --manifest ${manifestFlag}`}\` to create it.`;
    throw configError(error.message, { cause: error, hint });
  }
}

/**
 * Loads the project's config, or the one named by `--config` relative to the working directory, raising a config
 * error when it cannot be evaluated.
 */
export async function loadVerifyConfig(
  projectDir: string,
  configPath: string | undefined,
  dependencies: VerifyDependencies = defaultVerifyDependencies,
): Promise<ResolvedRdyConfig> {
  try {
    return await dependencies.loadConfig({
      fromDir: projectDir,
      ...(configPath !== undefined && { overridePath: path.resolve(process.cwd(), configPath) }),
    });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error, hint: extractHint(error) });
  }
}

/**
 * Confirms esbuild is installed, raising a config error naming the install command when it is not.
 *
 * Refuses rather than degrading. `--rebuild` asks whether each bundle is reproducible, and a run
 * that concluded "no esbuild, so nothing to report" would pass while establishing nothing -- the
 * failure mode that the flag exists to remove.
 */
export async function requireEsbuild(dependencies: VerifyDependencies = defaultVerifyDependencies): Promise<void> {
  try {
    await dependencies.loadEsbuild();
  } catch (error: unknown) {
    throw configError(`rdy verify --rebuild requires esbuild, which is not installed. ${buildEsbuildInstallHint()}`, {
      cause: error,
    });
  }
}

/**
 * Returns the directory of the project to which a manifest belongs: the one containing it at the default manifest
 * path, or the working directory for a manifest elsewhere.
 */
export function resolveManifestProjectDir(manifestPath: string): string {
  const candidateDir = path.dirname(path.dirname(manifestPath));
  return path.relative(candidateDir, manifestPath) === path.normalize(DEFAULT_MANIFEST_PATH)
    ? candidateDir
    : process.cwd();
}

/** The collaborators that verification calls, replaceable so that a test can verify without their effects. */
export interface VerifyDependencies {
  checkDrift: typeof checkDrift;
  checkInputDrift: typeof checkInputDrift;
  checkRebuild: typeof checkRebuild;
  checkSourceDrift: typeof checkSourceDrift;
  loadConfig: typeof loadConfig;
  /** Settles only whether esbuild is installed, so that verification does not depend on the module's shape. */
  loadEsbuild: () => Promise<unknown>;
  readManifest: typeof readManifest;
}

/**
 * Verifies every kit that a manifest lists, yielding an event as the manifest starts, after each kit, and as the
 * manifest finishes, and returns the manifest's contribution to the run.
 */
export async function* verifyManifest(
  args: VerifyManifestArgs,
  dependencies: VerifyDependencies = defaultVerifyDependencies,
): AsyncGenerator<VerifyEvent, ManifestVerification> {
  const { manifest, manifestPath, shouldRebuild, project, uncompiled } = args;
  const manifestDir = path.dirname(manifestPath);

  yield {
    kind: 'manifestStarted',
    kitCount: manifest.kits.length,
    manifestPath: path.relative(process.cwd(), manifestPath),
  };

  const entries: JsonVerifyKitEntry[] = [];
  let failedCount = 0;
  for (const kit of manifest.kits) {
    const verdicts: KitVerdicts = {
      drift: dependencies.checkDrift(kit, manifestDir),
      inputs: dependencies.checkInputDrift(kit, manifestDir),
      rebuild: shouldRebuild ? await dependencies.checkRebuild(kit, manifestDir) : undefined,
      source: dependencies.checkSourceDrift(kit, manifestDir),
    };
    yield { kind: 'kitVerified', kit, verdicts };
    entries.push(buildVerifyEntry(kit.name, verdicts, project));
    if (!isPassingVerdict(verdicts)) {
      failedCount += 1;
    }
  }

  failedCount += uncompiled.length;
  yield { kind: 'manifestFinished', failedCount, totalCount: manifest.kits.length + uncompiled.length, uncompiled };

  return { kits: entries, passed: failedCount === 0, uncompiled };
}

/** Arguments for verifying the kits of one manifest. */
export interface VerifyManifestArgs {
  manifest: RdyManifest;
  manifestPath: string;
  shouldRebuild: boolean;
  /** The project named on each kit's JSON entry, given by a recursive verify alone. */
  project?: string;
  /** The kits that the compile settings select and the manifest does not record. */
  uncompiled: JsonVerifyUncompiledEntry[];
}

/** Verifies the kits of one manifest outside a sweep, ending with the run's `verifyFinished` event. */
export async function* verifySingleManifest(
  args: VerifyManifestArgs,
  dependencies: VerifyDependencies = defaultVerifyDependencies,
): AsyncGenerator<VerifyEvent> {
  const outcome = yield* verifyManifest(args, dependencies);
  yield { kind: 'verifyFinished', outcome };
}
