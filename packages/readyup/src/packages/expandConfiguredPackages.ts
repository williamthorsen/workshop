import path from 'node:path';

import { configError } from '../errors.ts';
import { KITS_DIR } from '../kitsDir.ts';
import { enumerateKits } from '../list/enumerateKits.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { readPackageVersion, resolvePackageRoot } from '../resolvePackageRoot.ts';

/** A kit published by an installed package, carrying the provenance its output is labelled with. */
export interface PackageKit {
  packageName: string;
  version: string | undefined;
  kitName: string;
  path: string;
}

/**
 * Expands configured package names into every kit those packages publish, in configured order.
 *
 * A package that is absent or publishes no kits fails the invocation rather than being skipped.
 * The list is hand-maintained, so a name in it states an intent, and skipping would hide exactly the drift
 * between that list and the project's dependencies that maintaining it by hand invites.
 */
export function expandConfiguredPackages(packageNames: string[], extension: string, fromDir?: string): PackageKit[] {
  return packageNames.flatMap((packageName) => expandOnePackage(packageName, extension, fromDir));
}

// region | Helpers

/** Expands one configured package into the kits it publishes. */
function expandOnePackage(packageName: string, extension: string, fromDir: string | undefined): PackageKit[] {
  const root = resolvePackageRoot(packageName, fromDir);
  if (root === undefined) {
    throw configError(
      `Configured package "${packageName}" is not installed; it must be a direct dependency of this project.`,
    );
  }

  const kitsDir = path.join(root, KITS_DIR);
  const kitNames = listPublishedKitNames(root, kitsDir, extension);
  if (kitNames.length === 0) {
    throw configError(`Configured package "${packageName}" publishes no kits in ${KITS_DIR}.`);
  }

  const version = readPackageVersion(root);
  return kitNames.map((kitName) => ({
    packageName,
    version,
    kitName,
    path: path.join(kitsDir, `${kitName}${extension}`),
  }));
}

/**
 * Names the kits a package publishes, preferring its manifest and falling back to its kit directory.
 *
 * The same precedence a local `--from` source already follows, so a package source and a directory source
 * answer alike. Only a missing manifest falls back: one that exists but cannot be parsed is a broken
 * publication, and quietly reading around it would report a kit list nobody declared.
 */
function listPublishedKitNames(root: string, kitsDir: string, extension: string): string[] {
  try {
    return readManifest(path.join(root, DEFAULT_MANIFEST_PATH)).kits.map((kit) => kit.name);
  } catch (error: unknown) {
    if (!(error instanceof ManifestNotFoundError)) throw error;
    return enumerateKits({ dir: kitsDir, extension });
  }
}

// endregion | Helpers
