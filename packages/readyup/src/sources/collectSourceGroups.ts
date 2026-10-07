import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { discoverKitPackages } from '../check-utils/discoverKitPackages.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { expandConfiguredSource, type SourceKit } from './expandConfiguredSources.ts';
import { type ConfiguredSource, parseConfiguredSource } from './parseConfiguredSource.ts';

/** A kit source and the kits that it publishes, as the dependency-axis view reports it. */
export interface SourceGroup {
  kind: 'package' | 'repository';
  /** The source as the config spells it; `npm:<name>` for a package found by discovery. */
  source: string;
  /** The package name, or the source's spelling for a repository. */
  name: string;
  version: string | undefined;
  configured: boolean;
  kits: SourceKit[];
}

interface SourceGroupOptions {
  configuredSources: readonly ConfiguredSource[];
  fromDir?: string;
  remote: RemoteFetchContext;
}

/**
 * Groups every kit source available to a project with the kits that it publishes.
 *
 * Packages come first, sorted by name: the installed direct dependencies named by discovery, unioned with the
 * `npm:` sources that the config names. Discovery reads the project's declared dependencies, while package
 * resolution walks `node_modules` upward and falls back to the project's workspaces, so a configured package that
 * is installed without being declared, or published by a workspace, is one that only the config half reports.
 * Repository sources follow in configured order: Nothing installs a repository, so only the config names one.
 *
 * Configured membership is passed as an argument rather than read here, which leaves the result a
 * function of a directory and a list: A caller sweeping a repository already has each project's config.
 *
 * A source that cannot be expanded is reported in a warning and omitted, matching the warn-and-continue behavior
 * that listing already follows elsewhere. Because listing is read-only, a broken source loses only its own group,
 * not the whole listing.
 */
export async function collectSourceGroups({
  configuredSources,
  fromDir = process.cwd(),
  remote,
}: SourceGroupOptions): Promise<SourceGroup[]> {
  const configuredPackages = new Set<string>();
  const repositories: ConfiguredSource[] = [];
  for (const configured of configuredSources) {
    if (configured.source.type === 'npm') {
      configuredPackages.add(configured.source.name);
    } else {
      repositories.push(configured);
    }
  }

  const packageNames = [...new Set([...discoverKitPackages(fromDir), ...configuredPackages])].toSorted();
  const packageGroups = packageNames.map(async (packageName) => {
    const kits = await expandOrWarn(parseConfiguredSource(`npm:${packageName}`), remote, fromDir);
    return buildGroup('package', packageName, configuredPackages.has(packageName), kits);
  });
  const repositoryGroups = repositories.map(async (configured) => {
    const kits = await expandOrWarn(configured, remote, fromDir);
    return buildGroup('repository', configured.spelling, true, kits);
  });

  const groups = await Promise.all([...packageGroups, ...repositoryGroups]);
  return groups.filter((group) => group !== undefined);
}

// region | Helpers

/** Builds a group from its kits, or `undefined` when the source contributed none. */
function buildGroup(
  kind: SourceGroup['kind'],
  name: string,
  configured: boolean,
  kits: SourceKit[],
): SourceGroup | undefined {
  const [first] = kits;
  if (first === undefined) return undefined;

  // Every kit of one source reports that source's spelling and version. Take the group's from the first.
  return { kind, source: first.source, name, version: first.version, configured, kits };
}

/** Expands one source into the kits that it publishes, reporting one that cannot be read and omitting it. */
async function expandOrWarn(
  configured: ConfiguredSource,
  remote: RemoteFetchContext,
  fromDir: string,
): Promise<SourceKit[]> {
  try {
    return await expandConfiguredSource(configured, '.js', remote, fromDir);
  } catch (error: unknown) {
    process.stderr.write(`Warning: ${describeError(error)}\n`);
    return [];
  }
}

// endregion | Helpers
