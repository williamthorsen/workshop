import process from 'node:process';

import { compareVersions } from '../check-utils/semver.ts';
import { kitLoadError } from '../errors/RdyError.ts';
import type { RdyKit } from '../kits/types.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import { VERSION } from '../version.ts';

/**
 * Fails a kit whose declared floor the running readyup does not meet.
 *
 * Checks the running readyup, not the version the bundle records, so a floor holds for a `--jit` run from source,
 * which records none.
 */
export function assertSatisfiesVersionFloor(kitName: string, kit: RdyKit): void {
  const floor = kit.minReadyupVersion;
  if (floor === undefined) return;
  if (compareVersions(toComparableVersion(VERSION), floor) >= 0) return;

  throw kitLoadError(`kit "${kitName}" requires readyup ${floor} or later, but this runner is ${VERSION}.`, {
    hint: `Upgrade readyup to ${floor} or later, or run the kit with a readyup that satisfies it.`,
  });
}

/**
 * Warns that a bundle was compiled by a readyup newer than the one running it.
 *
 * Stands in for a floor the author never declared, so a kit declaring one raises nothing here. The stderr line is
 * written in both output modes; the returned entries are what JSON mode adds to the report.
 */
export function warnOnVersionSkew(
  kitName: string,
  kit: RdyKit,
  compileTimeVersion: string | undefined,
): RaisedWarning[] {
  if (kit.minReadyupVersion !== undefined || compileTimeVersion === undefined) return [];
  if (compareVersions(toComparableVersion(compileTimeVersion), toComparableVersion(VERSION)) <= 0) return [];

  const warning: RaisedWarning = {
    code: 'version-skew',
    message: `kit "${kitName}" was compiled by readyup ${compileTimeVersion}, ahead of the ${VERSION} running it.`,
    remedy: `Upgrade readyup to ${compileTimeVersion} or later, or recompile the kit with this one.`,
  };
  process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  return [warning];
}

// region | Helpers

/** Matches the prerelease and build tails semver appends to a numeric version. */
const VERSION_TAIL = /[-+].*$/;

/**
 * Strips the prerelease and build tails from a version, leaving the numeric core.
 *
 * `compareVersions` maps each dot-separated segment through `Number`, so a prerelease yields `NaN` and satisfies
 * neither `>=` nor `<=`, leaving a runner on one neither blocked by a floor nor reported as skewed. Comparing the
 * numeric core makes `0.35.0-rc.1` satisfy a `0.35.0` floor, erring toward letting a chosen prerelease run.
 */
function toComparableVersion(version: string): string {
  return version.replace(VERSION_TAIL, '');
}

// endregion | Helpers
