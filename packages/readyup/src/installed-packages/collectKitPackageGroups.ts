import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { discoverKitPackages } from '../check-utils/discoverKitPackages.ts';
import { expandConfiguredPackages, type PackageKit } from './expandConfiguredPackages.ts';

/** A kit-publishing dependency and the kits it publishes, as the dependency-axis view reports it. */
export interface KitPackageGroup {
  packageName: string;
  version: string | undefined;
  configured: boolean;
  kits: PackageKit[];
}

interface KitPackageGroupOptions {
  configuredPackages: string[];
  fromDir?: string;
}

/**
 * Groups every kit-publishing dependency with the kits it publishes, sorted by package name.
 *
 * The set unions the installed direct dependencies discovery names with the packages the config names.
 * Discovery reads the project's declared dependencies, while package resolution walks `node_modules`
 * upward, so a configured package installed without being declared is one only the config half reports.
 *
 * Configured membership arrives as an argument rather than being read here, which leaves the answer a
 * function of a directory and a list: a caller sweeping a repository already holds each project's config.
 *
 * A package that cannot be expanded warns and is omitted, matching the warn-and-continue listing already
 * takes elsewhere. Listing is read-only, so a broken dependency costs its own group rather than the answer.
 */
export function collectKitPackageGroups({
  configuredPackages,
  fromDir = process.cwd(),
}: KitPackageGroupOptions): KitPackageGroup[] {
  const configured = new Set(configuredPackages);
  const packageNames = new Set([...discoverKitPackages(fromDir), ...configuredPackages]);

  return [...packageNames].toSorted().flatMap((packageName) => {
    const kits = expandOrWarn(packageName, fromDir);
    if (kits.length === 0) return [];

    // Every kit of one package reports that package's version, so the first speaks for the group.
    return [{ packageName, version: kits[0]?.version, configured: configured.has(packageName), kits }];
  });
}

// region | Helpers

/** Expands one package into the kits it publishes, reporting one that cannot be read and omitting it. */
function expandOrWarn(packageName: string, fromDir: string): PackageKit[] {
  try {
    return expandConfiguredPackages([packageName], '.js', fromDir);
  } catch (error: unknown) {
    process.stderr.write(`Warning: ${describeError(error)}\n`);
    return [];
  }
}

// endregion | Helpers
