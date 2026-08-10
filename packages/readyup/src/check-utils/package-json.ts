import { isRecord } from '../portable/isRecord.ts';
import { hasJsonField, readJsonFile } from './json.ts';
import { compareVersions } from './semver.ts';

/** Read and parse the root package.json. Return undefined if it doesn't exist or isn't an object. */
export function readPackageJson(): Record<string, unknown> | undefined {
  return readJsonFile('package.json');
}

/** Check whether package.json has a field, optionally with a specific value. */
export function hasPackageJsonField(field: string, expectedValue?: string): boolean {
  return hasJsonField('package.json', field, expectedValue);
}

/** Check whether a dev dependency is present in package.json. */
export function hasDevDependency(name: string): boolean {
  const pkg = readJsonFile('package.json');
  if (pkg === undefined) return false;
  const devDeps = pkg['devDependencies'];
  return isRecord(devDeps) && Object.hasOwn(devDeps, name);
}

/**
 * Checks whether a dev dependency meets a minimum version. Any `workspace:`-prefixed specifier satisfies any floor,
 * including one that names a version: the specifier links to the package the repo builds, and a version it names is a
 * publish range, not the version that resolves. `exempt` adds further exemptions; it cannot remove this one.
 */
export function hasMinDevDependencyVersion(
  name: string,
  minVersion: string,
  options?: { exempt?: (specifier: string) => boolean },
): boolean {
  const pkg = readJsonFile('package.json');
  if (pkg === undefined) return false;
  const devDeps = pkg['devDependencies'];
  if (!isRecord(devDeps) || !Object.hasOwn(devDeps, name)) return false;
  const specifier = devDeps[name];
  if (typeof specifier !== 'string') return false;
  if (specifier.startsWith('workspace:')) return true;
  if (options?.exempt?.(specifier)) return true;
  // Strip leading semver range operators to extract the base version.
  const versionMatch = /(\d+\.\d+\.\d+)/.exec(specifier)?.[1];
  if (versionMatch === undefined) return false;
  return compareVersions(versionMatch, minVersion) >= 0;
}
