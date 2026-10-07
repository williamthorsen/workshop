import path from 'node:path';
import process from 'node:process';

import { kitLoadError, usageError } from '../errors/RdyError.ts';
import { readPackageVersion, resolvePackageRoot } from '../installed-packages/resolvePackageRoot.ts';
import type { KitProvenance } from '../kits/KitProvenance.ts';
import { KITS_DIR, resolveHomeDir } from '../kits/kitsDir.ts';
import type { FromSource, NpmSource } from '../kits/parseFromValue.ts';
import { buildRepositoryKitUrl, type RepositorySource } from '../remote/kitSourceUrls.ts';
import type { KitSpecifier } from './parseKitSpecifiers.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';

/** Resolves kit entries from a parsed `--from` source, whose `spelling` is the value as the reader wrote it. */
export function resolveFromSource(
  source: FromSource,
  spelling: string,
  specs: KitSpecifier[],
  extension: string,
): ResolvedKitEntry[] {
  switch (source.type) {
    case 'bitbucket':
    case 'github': {
      const provenance = buildRepositoryProvenance(source, spelling);
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { url: buildRepositoryKitUrl(source, spec.kitName, extension) },
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
        source: spelling,
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

/** Records where a repository kit came from, in the structured form that check-ID namespacing reads. */
function buildRepositoryProvenance(source: RepositorySource, spelling: string): KitProvenance {
  const owner = source.type === 'github' ? source.org : source.workspace;
  return { kind: 'repository', host: source.type, owner, repo: source.repo, ref: source.ref, source: spelling };
}

/**
 * Locates the root of a package named by `npm:`, rejecting the forms that are reserved but not yet supported.
 *
 * A version spec is parsed rather than ignored so that the syntax stays reserved for running a published
 * version; until that is supported, naming one points at the flag that runs a published kit today.
 *
 * The not-installed message names the direct-dependency requirement because pnpm's layout links only
 * direct dependencies into a project's `node_modules`. A transitive dependency is genuinely unreachable
 * here, and a bare "not installed" would contradict the lockfile that the reader is looking at.
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
