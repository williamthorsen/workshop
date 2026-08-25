import path from 'node:path';
import process from 'node:process';

import { kitLoadError, usageError } from '../errors/RdyError.ts';
import { readPackageVersion, resolvePackageRoot } from '../installed-packages/resolvePackageRoot.ts';
import type { KitProvenance } from '../kits/KitProvenance.ts';
import { KITS_DIR, resolveHomeDir } from '../kits/kitsDir.ts';
import type { FromSource, NpmSource } from '../kits/parseFromValue.ts';
import type { KitSpecifier } from './parseKitSpecifiers.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';

/** Resolves kit entries from a parsed `--from` source. */
export function resolveFromSource(source: FromSource, specs: KitSpecifier[], extension: string): ResolvedKitEntry[] {
  switch (source.type) {
    case 'github': {
      const provenance: KitProvenance = { kind: 'remote', label: `github:${source.org}/${source.repo}@${source.ref}` };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { url: buildGitHubKitUrl(source.org, source.repo, source.ref, spec.kitName, extension) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'bitbucket': {
      const label = `bitbucket:${source.workspace}/${source.repo}@${source.ref}`;
      const provenance: KitProvenance = { kind: 'remote', label };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { url: buildBitbucketKitUrl(source.workspace, source.repo, source.ref, spec.kitName, extension) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'npm': {
      const root = resolveInstalledPackageRoot(source);
      const provenance: KitProvenance = {
        kind: 'package',
        packageName: source.name,
        version: readPackageVersion(root),
      };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(root, KITS_DIR, `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'global': {
      const homeDir = resolveHomeDir();
      const provenance: KitProvenance = { kind: 'directory', label: `~/${KITS_DIR}` };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(homeDir, KITS_DIR, `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'directory': {
      const provenance: KitProvenance = { kind: 'directory', label: source.path };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(path.resolve(process.cwd(), source.path), `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'local': {
      const resolvedBase = path.resolve(process.cwd(), source.path);
      const provenance: KitProvenance = { kind: 'directory', label: path.join(source.path, KITS_DIR) };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(resolvedBase, KITS_DIR, `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
        provenance,
      }));
    }
  }
}

// region | Helpers

/** Builds the Bitbucket Cloud API source URL for a kit. */
function buildBitbucketKitUrl(workspace: string, repo: string, ref: string, kit: string, extension: string): string {
  return `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${ref}/${KITS_DIR}/${kit}${extension}`;
}

/** Builds the GitHub raw content URL for a kit. */
function buildGitHubKitUrl(org: string, repo: string, ref: string, kit: string, extension: string): string {
  return `https://raw.githubusercontent.com/${org}/${repo}/${ref}/${KITS_DIR}/${kit}${extension}`;
}

/**
 * Locates the root of a package named by `npm:`, rejecting the forms that are reserved but not yet served.
 *
 * A version spec is parsed rather than ignored so the syntax stays reserved for running a published
 * version; until that lands, naming one points at the flag that reaches a published kit today.
 *
 * The not-installed message names the direct-dependency requirement because pnpm's layout links only
 * direct dependencies into a project's `node_modules`. A transitive dependency is genuinely unreachable
 * here, and a bare "not installed" would contradict the lockfile the reader is looking at.
 */
function resolveInstalledPackageRoot(source: NpmSource): string {
  if (source.versionSpec !== undefined) {
    throw usageError(
      `Running a published version is not supported yet: "npm:${source.name}@${source.versionSpec}". ` +
        'Use --url to name a published kit, or drop the version to run the installed copy.',
    );
  }

  const root = resolvePackageRoot(source.name);
  if (root === undefined) {
    throw kitLoadError(`Package "${source.name}" is not installed; it must be a direct dependency of this project.`);
  }
  return root;
}

// endregion | Helpers
