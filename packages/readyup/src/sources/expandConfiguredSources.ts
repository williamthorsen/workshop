import path from 'node:path';

import { configError } from '../errors/RdyError.ts';
import { readPackageVersion, resolvePackageRoot } from '../installed-packages/resolvePackageRoot.ts';
import { resolveWorkspaceRoot } from '../installed-packages/resolveWorkspaceRoot.ts';
import { buildRepositoryProvenance, type KitProvenance } from '../kits/KitProvenance.ts';
import { KITS_DIR } from '../kits/kitsDir.ts';
import { enumerateKits } from '../list/enumerateKits.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { buildRepositoryKitUrl, buildRepositoryManifestUrl, type RepositorySource } from '../remote/kitSourceUrls.ts';
import { loadRemoteManifest } from '../remote/loadRemoteManifest.ts';
import { resolveRemoteProvider } from '../remote/remote-provider.ts';
import { toRemoteRdyError } from '../remote/toRemoteRdyError.ts';
import type { ConfiguredSource } from './parseConfiguredSource.ts';

/** A kit published by a configured source, with the provenance that its output is labelled with. */
export interface SourceKit {
  /** The source as the config spells it; `npm:<name>` for a package found by discovery. */
  source: string;
  version: string | undefined;
  kitName: string;
  description: string | undefined;
  checklists: string[] | undefined;
  location: { path: string } | { url: string };
  provenance: KitProvenance;
}

/** One kit published by a source, as its manifest or its kit directory names it. */
interface PublishedKit {
  name: string;
  description: string | undefined;
  checklists: string[] | undefined;
}

/**
 * Expands configured sources into every kit that those sources publish, in configured order.
 *
 * A source that cannot be resolved or publishes no kits fails the invocation rather than being skipped.
 * The list is hand-maintained, so an entry in it states an intent, and skipping would hide exactly the drift
 * between that list and what the project can reach that maintaining it by hand invites.
 */
export async function expandConfiguredSources(
  sources: readonly ConfiguredSource[],
  extension: string,
  remote: RemoteFetchContext,
  fromDir?: string,
): Promise<SourceKit[]> {
  const expanded = await Promise.all(
    sources.map((configured) => expandConfiguredSource(configured, extension, remote, fromDir)),
  );
  return expanded.flat();
}

/** Expands one configured source into the kits that it publishes. */
export async function expandConfiguredSource(
  { spelling, source }: ConfiguredSource,
  extension: string,
  remote: RemoteFetchContext,
  fromDir?: string,
): Promise<SourceKit[]> {
  return source.type === 'npm'
    ? expandPackage(spelling, source.name, extension, fromDir)
    : expandRepository(spelling, source, extension, remote);
}

// region | Helpers

/** Expands an installed package or a workspace into the kits that it publishes. */
function expandPackage(
  spelling: string,
  packageName: string,
  extension: string,
  fromDir: string | undefined,
): SourceKit[] {
  // Search `node_modules` first, so that a package that is both installed and a workspace resolves to the
  // installed copy.
  const root = resolvePackageRoot(packageName, fromDir) ?? resolveWorkspaceRoot(packageName, fromDir);
  if (root === undefined) {
    throw configError(
      `Configured source "${spelling}" was not found; it must be a direct dependency of this project or one of its workspaces.`,
    );
  }

  const kitsDir = path.join(root, KITS_DIR);
  const publishedKits = listPublishedKits(root, kitsDir, extension);
  if (publishedKits.length === 0) {
    throw configError(`Configured source "${spelling}" publishes no kits in ${KITS_DIR}.`);
  }

  const version = readPackageVersion(root);
  const provenance: KitProvenance = { kind: 'package', packageName, version, source: spelling };
  return publishedKits.map((kit) => ({
    source: spelling,
    version,
    kitName: kit.name,
    description: kit.description,
    checklists: kit.checklists,
    location: { path: path.join(kitsDir, `${kit.name}${extension}`) },
    provenance,
  }));
}

/**
 * Expands a repository into the kits that its published manifest lists.
 *
 * A host's raw-content endpoint cannot enumerate a directory, so a repository publishing no manifest has
 * no kits to offer. A fetch failure keeps the diagnosis, credential hint included, that `--from` gives it,
 * prefixed by the entry so that the reader knows which line of the config to correct.
 */
async function expandRepository(
  spelling: string,
  source: RepositorySource,
  extension: string,
  remote: RemoteFetchContext,
): Promise<SourceKit[]> {
  const url = buildRepositoryManifestUrl(source);
  const provider = resolveRemoteProvider(url);

  let manifest;
  try {
    manifest = await loadRemoteManifest({
      url,
      cache: remote.cache,
      resolveHeaders: () => remote.resolveAuthHeaders(provider),
    });
  } catch (error: unknown) {
    const tokenForwarded = remote.resolveAuthHeaders(provider) !== undefined;
    const diagnosis = toRemoteRdyError(error, { code: 'config', provider, tokenForwarded, url });
    throw configError(`Configured source "${spelling}": ${diagnosis.message}`, {
      cause: error,
      hint: diagnosis.hint,
    });
  }

  if (manifest.kits.length === 0) {
    throw configError(`Configured source "${spelling}" publishes no kits; its manifest at ${url} lists none.`);
  }

  const provenance = buildRepositoryProvenance(source, spelling);
  return manifest.kits.map((kit) => ({
    source: spelling,
    version: undefined,
    kitName: kit.name,
    description: kit.description,
    checklists: kit.checklists,
    location: { url: buildRepositoryKitUrl(source, kit.name, extension) },
    provenance,
  }));
}

/**
 * Names the kits that a package publishes, preferring its manifest and falling back to its kit directory.
 *
 * The same precedence that a local `--from` source already follows, so that a package source and a directory source
 * resolve alike. Only a missing manifest falls back: One that exists but cannot be parsed is a broken
 * publication, and quietly reading around it would report a kit list that nobody declared. Descriptions and
 * checklist names live in the manifest, so the fallback names kits without them.
 */
function listPublishedKits(root: string, kitsDir: string, extension: string): PublishedKit[] {
  try {
    return readManifest(path.join(root, DEFAULT_MANIFEST_PATH)).kits.map((kit) => ({
      name: kit.name,
      description: kit.description,
      checklists: kit.checklists,
    }));
  } catch (error: unknown) {
    if (!(error instanceof ManifestNotFoundError)) throw error;
    return enumerateKits({ dir: kitsDir, extension, recursive: true }).map((name) => ({
      name,
      description: undefined,
      checklists: undefined,
    }));
  }
}

// endregion | Helpers
