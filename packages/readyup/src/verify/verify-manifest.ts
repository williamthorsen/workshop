import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../bin/exitCodes.ts';
import { buildEsbuildInstallHint } from '../compile/buildBundle.ts';
import { collectSourceKitNames } from '../compile/collectSourceKitNames.ts';
import { loadEsbuild } from '../compile/loadEsbuild.ts';
import { loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import { configError } from '../errors/RdyError.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { writeHuman } from '../output/writeHuman.ts';
import {
  type JsonVerifyKitEntry,
  type JsonVerifyOutput,
  type JsonVerifyProjectEntry,
  type JsonVerifyUncompiledEntry,
  SCHEMA_VERSION,
} from '../schemas/verifyOutputSchema.ts';
import { checkDrift } from './checkDrift.ts';
import { checkInputDrift } from './checkInputDrift.ts';
import { checkRebuild } from './checkRebuild.ts';
import { checkSourceDrift } from './checkSourceDrift.ts';
import type { KitVerdicts } from './verdicts.ts';
import { buildVerifyEntry, formatStatusLine, formatUncompiledLine, isPassingVerdict } from './verify-report.ts';

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

/** Emits the verify payload under `--json` and turns the run's verdict into an exit code. */
export function finishVerify({ kits, passed, projects, uncompiled }: VerifyOutcome, json: boolean): number {
  if (json) {
    const output: JsonVerifyOutput = {
      schemaVersion: SCHEMA_VERSION,
      passed,
      kits,
      ...(projects !== undefined && { projects }),
      ...(uncompiled.length > 0 && { uncompiled }),
    };
    process.stdout.write(JSON.stringify(output) + '\n');
  }

  return passed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/**
 * Reads a manifest, raising a config error when it is missing, unreadable, or invalid.
 *
 * A missing manifest's hint repeats `manifestFlag`, the `--manifest` value as typed, so that the user can rerun it.
 */
export function loadManifest(manifestPath: string, manifestFlag?: string): RdyManifest {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    const hint =
      error instanceof ManifestNotFoundError
        ? `Run \`rdy compile${manifestFlag === undefined ? '' : ` --manifest ${manifestFlag}`}\` to create it.`
        : undefined;
    throw configError(describeError(error), { cause: error, hint });
  }
}

/**
 * Loads the project's config, or the one named by `--config` relative to the working directory, raising a config
 * error when it cannot be evaluated.
 */
export async function loadVerifyConfig(projectDir: string, configPath: string | undefined): Promise<ResolvedRdyConfig> {
  try {
    return await loadConfig({
      fromDir: projectDir,
      ...(configPath !== undefined && { overridePath: path.resolve(process.cwd(), configPath) }),
    });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error, hint: extractHint(error) });
  }
}

/** One manifest's contribution to a verify run. */
export interface ManifestVerification {
  kits: JsonVerifyKitEntry[];
  /** `true` when every kit in the manifest passed and every selected source is recorded. */
  passed: boolean;
  uncompiled: JsonVerifyUncompiledEntry[];
}

/**
 * Confirms esbuild is installed, raising a config error naming the install command when it is not.
 *
 * Refuses rather than degrading. `--rebuild` asks whether each bundle is reproducible, and a run
 * that concluded "no esbuild, so nothing to report" would pass while establishing nothing -- the
 * failure mode that the flag exists to remove.
 */
export async function requireEsbuild(): Promise<void> {
  try {
    await loadEsbuild();
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

/** Verifies every kit that a manifest lists, writing a heading, one line per kit, and one per uncompiled kit. */
export async function verifyManifest(args: VerifyManifestArgs): Promise<ManifestVerification> {
  const { manifest, manifestPath, rebuild, json, project, uncompiled } = args;
  const manifestDir = path.dirname(manifestPath);

  const relManifestPath = path.relative(process.cwd(), manifestPath);
  writeHuman(`${getLayout().formatHeading(`Verifying kits against ${relManifestPath}`, 'section')}\n`, json);

  if (manifest.kits.length === 0) {
    writeHuman('(no kits in manifest)\n', json);
  }

  const entries: JsonVerifyKitEntry[] = [];
  let failed = 0;
  for (const kit of manifest.kits) {
    const verdicts: KitVerdicts = {
      drift: checkDrift(kit, manifestDir),
      inputs: checkInputDrift(kit, manifestDir),
      rebuild: rebuild ? await checkRebuild(kit, manifestDir) : undefined,
      source: checkSourceDrift(kit, manifestDir),
    };
    writeHuman(formatStatusLine(kit, verdicts), json);
    entries.push(buildVerifyEntry(kit.name, verdicts, project));
    if (!isPassingVerdict(verdicts)) {
      failed += 1;
    }
  }

  for (const entry of uncompiled) {
    writeHuman(formatUncompiledLine(entry), json);
  }
  failed += uncompiled.length;

  if (failed > 0) {
    writeHuman(`\n${failed} of ${manifest.kits.length + uncompiled.length} kits failed verification.\n`, json);
  }

  return { kits: entries, passed: failed === 0, uncompiled };
}

/** Arguments for verifying the kits of one manifest. */
export interface VerifyManifestArgs {
  manifest: RdyManifest;
  manifestPath: string;
  rebuild: boolean;
  json: boolean;
  /** The project named on each kit's JSON entry, given by a recursive verify alone. */
  project?: string;
  /** The kits that the compile settings select and the manifest does not record. */
  uncompiled: JsonVerifyUncompiledEntry[];
}

/** A verify run's result, before it is emitted. */
export interface VerifyOutcome extends ManifestVerification {
  /** Every project that a recursive verify visited; absent from any other run. */
  projects?: JsonVerifyProjectEntry[];
}
