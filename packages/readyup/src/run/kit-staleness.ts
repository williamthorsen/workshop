import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { toDisplayPath } from '../portable/toDisplayPath.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import { checkDrift } from '../verify/checkDrift.ts';
import type { InputsStatus } from '../verify/checkInputDrift.ts';
import { checkInputDrift } from '../verify/checkInputDrift.ts';
import { checkSourceDrift } from '../verify/checkSourceDrift.ts';
import type { KitSource } from './ResolvedKitEntry.ts';

/** What reading the manifest yielded: the tracking where one was read, and any advisory the read raised. */
export interface ManifestRead {
  tracking: ManifestTracking | undefined;
  warnings: RaisedWarning[];
}

/** The manifest an invocation checks its kits against, read once and shared by every kit in the run. */
export interface ManifestTracking {
  manifest: RdyManifest;
  manifestDir: string;
}

/**
 * Reads the default manifest for the run's advisories, best effort.
 *
 * No failure here stops the run: a verification tool that refused to run because its own bookkeeping
 * was unreadable would be worse than one that runs and says so. What separates the two outcomes is
 * whether the manifest is there. An absent one is the normal state of a project that never compiled
 * and says nothing about any kit, so it is silent. A present one that cannot be read raises
 * `manifest-unreadable`, because every staleness axis then goes unchecked for every kit in the run,
 * and a run that checked nothing is indistinguishable from one that found nothing. `--jit` runs from
 * source, which the manifest does not describe, so they skip the read entirely.
 */
export function readManifestTracking(isJit: boolean): ManifestRead {
  if (isJit) return { tracking: undefined, warnings: [] };

  const manifestPath = path.resolve(process.cwd(), DEFAULT_MANIFEST_PATH);
  try {
    const tracking = { manifest: readManifest(manifestPath), manifestDir: path.dirname(manifestPath) };
    return { tracking, warnings: [] };
  } catch (error: unknown) {
    if (error instanceof ManifestNotFoundError) return { tracking: undefined, warnings: [] };
    return { tracking: undefined, warnings: [raiseUnreadableManifest(manifestPath, error)] };
  }
}

/**
 * Emits advisory stderr warnings when the manifest disagrees with the kit that is about to run.
 *
 * `target-drift` says the compiled bundle is not the one the manifest recorded, so someone edited
 * it by hand. `source-stale` says the TypeScript it was built from has moved on, so the run is
 * about to execute checks that no longer match their source. `input-stale` says the same of a file
 * the compile read and inlined, which is the staleness neither hash can see. All three can hold at
 * once.
 *
 * Advisory by design: `rdy verify` is the enforcing gate, and this never touches the exit code.
 * Every axis speaks only where it compared a recorded hash against a file and the two differed. A
 * kit no entry describes, an entry recording no hash or no closure, a remote or just-in-time
 * source, and a file that is gone or cannot be read are all silent, because none of them is
 * evidence that anything changed.
 *
 * The stderr lines are written in both modes; the returned entries are what JSON mode captures into
 * the report, so a consumer that owns only stdout still learns the run was advised of something.
 */
export function warnOnKitStaleness(
  kitName: string,
  source: KitSource,
  tracking: ManifestTracking | undefined,
): RaisedWarning[] {
  if (tracking === undefined || 'url' in source) return [];

  const entry = findManifestEntry(source.path, tracking);
  if (entry === undefined) return [];

  const warnings: RaisedWarning[] = [];
  if (readVerdict(() => checkDrift(entry, tracking.manifestDir))?.kind === 'drift') {
    warnings.push({
      code: 'target-drift',
      message: `compiled kit "${kitName}" does not match the hash the manifest recorded for it.`,
      remedy: 'Run `rdy compile --force` to rebuild it from source.',
    });
  }
  if (readVerdict(() => checkSourceDrift(entry, tracking.manifestDir))?.kind === 'stale') {
    warnings.push({
      code: 'source-stale',
      message: `kit "${kitName}" was compiled from an older source than the one on disk.`,
      remedy: 'Run `rdy compile` to rebuild it.',
    });
  }
  if (hasChangedInput(readVerdict(() => checkInputDrift(entry, tracking.manifestDir)))) {
    warnings.push({
      code: 'input-stale',
      message: `kit "${kitName}" inlined files that no longer match the ones on disk.`,
      remedy: 'Run `rdy compile` to rebuild it.',
    });
  }

  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  }
  return warnings;
}

// region | Helpers

/**
 * Finds the manifest entry describing a kit, matching on resolved compiled path.
 *
 * Matching by name instead would misfire wherever a kit's name and its file differ: `--file`
 * names a kit by an arbitrary path, and a custom `outDir` puts a differently-named entry's output
 * where this one's would go.
 */
function findManifestEntry(kitPath: string, tracking: ManifestTracking): RdyManifest['kits'][number] | undefined {
  const resolvedKitPath = path.resolve(process.cwd(), kitPath);
  return tracking.manifest.kits.find(
    (kit) => kit.path !== undefined && path.resolve(tracking.manifestDir, kit.path) === resolvedKitPath,
  );
}

/**
 * Reports whether a closure verdict names an input whose content moved since the compile read it.
 *
 * An input that is gone, or that no longer yields the projection a kit picked, says nothing about
 * whether the kit is stale -- a published kit legitimately ships without the sources it was built
 * from -- so only a hash the check compared and found different raises the advisory.
 */
function hasChangedInput(status: InputsStatus | undefined): boolean {
  return status?.kind === 'stale' && status.failures.some((failure) => failure.reason === 'changed');
}

/** Raises the advisory for a manifest that is present and unreadable, and writes its stderr line. */
function raiseUnreadableManifest(manifestPath: string, error: unknown): RaisedWarning {
  const warning: RaisedWarning = {
    code: 'manifest-unreadable',
    message: `${toDisplayPath(manifestPath)} could not be read, so no kit was checked against it: ${describeError(error)}`,
    remedy: 'Run `rdy compile` to rewrite it.',
  };
  process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  return warning;
}

/** Returns a staleness verdict, or `undefined` when reaching one needed a file that cannot be read. */
function readVerdict<TStatus>(check: () => TStatus): TStatus | undefined {
  try {
    return check();
  } catch {
    return undefined;
  }
}

// endregion | Helpers
