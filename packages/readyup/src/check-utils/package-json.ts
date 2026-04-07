import { isRecord } from '../isRecord.ts';
import { readFile } from './filesystem.ts';
import { compareVersions } from './semver.ts';

/** Read and parse the root package.json. Return undefined if it doesn't exist or isn't an object. */
export function readPackageJson(): Record<string, unknown> | undefined {
  const content = readFile('package.json');
  if (content === undefined) return undefined;
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) return undefined;
  return Object.fromEntries(Object.entries(parsed));
}

/** Check whether package.json has a field, optionally with a specific value. */
export function hasPackageJsonField(field: string, expectedValue?: string): boolean {
  const pkg = readPackageJson();
  if (pkg === undefined) return false;
  if (expectedValue !== undefined) return pkg[field] === expectedValue;
  return field in pkg;
}

/** Check whether a dev dependency is present in package.json. */
export function hasDevDependency(name: string): boolean {
  const pkg = readPackageJson();
  if (pkg === undefined) return false;
  const devDeps = pkg.devDependencies;
  return isRecord(devDeps) && name in devDeps;
}

/** Check whether a dev dependency meets a minimum version, with optional exemption predicate. */
export function hasMinDevDependencyVersion(
  name: string,
  minVersion: string,
  options?: { exempt?: (range: string) => boolean },
): boolean {
  const pkg = readPackageJson();
  if (pkg === undefined) return false;
  const devDeps = pkg.devDependencies;
  if (!isRecord(devDeps) || !(name in devDeps)) return false;
  const range = devDeps[name];
  if (typeof range !== 'string') return false;
  if (options?.exempt?.(range)) return true;
  // Strip leading semver range operators to extract the base version.
  const versionMatch = /(\d+\.\d+\.\d+)/.exec(range)?.[1];
  if (versionMatch === undefined) return false;
  return compareVersions(versionMatch, minVersion) >= 0;
}
