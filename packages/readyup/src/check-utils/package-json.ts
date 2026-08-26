import { isRecord } from '../portable/isRecord.ts';
import { readFile } from './filesystem.ts';
import { hasJsonField, readJsonFile } from './json.ts';
import { findPnpmCatalogVersion } from './pnpmWorkspaceYaml.ts';
import { compareVersions } from './semver.ts';

/** The pnpm workspace manifest, read from the working directory like the `package.json` it resolves specifiers for. */
const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml';

/** Leading range operators and the `v` prefix, stripped before a version is parsed from the start of a specifier. */
const RANGE_PREFIX = /^[\s^~=<>v]+/;

/** Returns the parsed root package.json, or undefined where it does not exist or is not an object. */
export function readPackageJson(): Record<string, unknown> | undefined {
  return readJsonFile('package.json');
}

/** Reports whether package.json has a field, optionally holding a specific value. */
export function hasPackageJsonField(field: string, expectedValue?: string): boolean {
  return hasJsonField('package.json', field, expectedValue);
}

/** Reports whether package.json declares a dev dependency. */
export function hasDevDependency(name: string): boolean {
  const pkg = readJsonFile('package.json');
  if (pkg === undefined) return false;
  const devDeps = pkg['devDependencies'];
  return isRecord(devDeps) && Object.hasOwn(devDeps, name);
}

/**
 * Checks whether a dev dependency meets a minimum version. Any `workspace:`-prefixed specifier satisfies any floor,
 * including one that names a version: the specifier links to the package the repo builds, and a version it names is a
 * publish range, not the version that resolves. A `catalog:` specifier is resolved through `pnpm-workspace.yaml` and
 * measured against the version it finds there; one that resolves to no version meets no floor. `exempt` receives the
 * specifier as declared, so a catalogued dependency reaches it as `catalog:`; it adds further exemptions and cannot
 * remove the `workspace:` one.
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
  const declared = devDeps[name];
  if (typeof declared !== 'string') return false;
  if (declared.startsWith('workspace:')) return true;
  if (options?.exempt?.(declared)) return true;

  let specifier = declared;
  if (declared.startsWith('catalog:')) {
    const resolved = resolveCatalogSpecifier(declared, name);
    if (resolved === undefined) return false;
    // A catalog entry may itself link to the workspace, which the rule above sees only on a declared specifier.
    if (resolved.startsWith('workspace:')) return true;
    specifier = resolved;
  }

  const version = extractVersion(specifier);
  if (version === undefined) return false;
  return compareVersions(version, minVersion) >= 0;
}

// region | Helpers

/** Extracts the version a specifier declares, or undefined when it names none. */
function extractVersion(specifier: string): string | undefined {
  // Parse from the start, so a specifier naming fewer than three segments (`7`, `^6`) is measured rather than skipped;
  // `compareVersions` pads a short version against the floor.
  const fromStart = /^\d+(?:\.\d+)*/.exec(specifier.replace(RANGE_PREFIX, ''))?.[0];
  if (fromStart !== undefined) return fromStart;
  // A specifier with its version elsewhere, such as the `npm:` alias protocol, still yields a three-segment match.
  return /\d+\.\d+\.\d+/.exec(specifier)?.[0];
}

/** Resolves a `catalog:` specifier to the version its catalog assigns the package, or undefined when nothing does. */
function resolveCatalogSpecifier(specifier: string, name: string): string | undefined {
  const yaml = readFile(PNPM_WORKSPACE_FILE);
  if (yaml === undefined) return undefined;
  const catalogName = specifier.slice('catalog:'.length).trim();
  return findPnpmCatalogVersion(yaml, name, catalogName === '' ? undefined : catalogName);
}

// endregion | Helpers
