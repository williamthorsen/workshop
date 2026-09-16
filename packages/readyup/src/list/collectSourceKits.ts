import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { configError, kitLoadError, usageError } from '../errors/RdyError.ts';
import { resolvePackageRoot } from '../installed-packages/resolvePackageRoot.ts';
import { KITS_DIR, resolveHomeDir } from '../kits/kitsDir.ts';
import type { DirectorySource, FromSource, GlobalSource, LocalSource, NpmSource } from '../kits/parseFromValue.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { loadRemoteManifest } from '../remote/loadRemoteManifest.ts';
import { resolveRemoteProvider } from '../remote/remote-provider.ts';
import { toRemoteRdyError } from '../remote/toRemoteRdyError.ts';
import type { JsonListKitEntry } from '../schemas/listOutputSchema.ts';
import { buildManifestEntry } from './buildManifestEntry.ts';
import { enumerateKits } from './enumerateKits.ts';

/** The kits that a `--from` source holds, with the location from which they were read. */
export type SourceKits =
  | { kind: 'local'; kits: JsonListKitEntry[]; kitsDir: string }
  | { kind: 'remote'; kits: JsonListKitEntry[]; manifestUrl: string };

/** A local `--from` source, which resolves to a directory on this machine. */
type LocalFromSource = DirectorySource | GlobalSource | LocalSource;

/** Returns the kits that a `--from` source holds, as the rows that `rdy list --from` reports. */
export async function collectSourceKits(source: FromSource, remote: RemoteFetchContext): Promise<SourceKits> {
  if (source.type === 'github') {
    const url = `https://raw.githubusercontent.com/${source.org}/${source.repo}/${source.ref}/.readyup/manifest.json`;
    return collectRemoteKits(url, remote);
  }

  if (source.type === 'bitbucket') {
    const url = `https://api.bitbucket.org/2.0/repositories/${source.workspace}/${source.repo}/src/${source.ref}/.readyup/manifest.json`;
    return collectRemoteKits(url, remote);
  }

  if (source.type === 'npm') {
    const root = resolveSourcePackageRoot(source);
    return collectLocalKits(path.join(root, DEFAULT_MANIFEST_PATH), path.join(root, KITS_DIR));
  }

  return collectLocalKits(resolveFromManifestPath(source), resolveFromKitsDir(source));
}

// region | Helpers

/** Reads the kits that a directory holds, preferring its manifest and falling back to the files on disk. */
function collectLocalKits(manifestPath: string, kitsDir: string): SourceKits {
  const manifest = readLocalManifestIfPresent(manifestPath);
  const kits =
    manifest === undefined
      ? enumerateCompiledKits(kitsDir, manifestPath)
      : manifest.kits.map((kit) => buildManifestEntry(kit, path.dirname(manifestPath)));

  return { kind: 'local', kits, kitsDir };
}

/** Fetches the kits at a remote manifest URL, authenticating where the host is one that readyup knows. */
async function collectRemoteKits(url: string, remote: RemoteFetchContext): Promise<SourceKits> {
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
    throw toRemoteRdyError(error, { code: 'config', provider, tokenForwarded, url });
  }

  // A remote manifest's paths name locations on the host that published it, so they are passed
  // through rather than rebased onto a directory that does not exist here.
  return { kind: 'remote', kits: manifest.kits.map((kit) => buildManifestEntry(kit, undefined)), manifestUrl: url };
}

/**
 * Enumerates the compiled kits in a directory, for a source that has no manifest beside it.
 *
 * `run --from` resolves a kit by filename alone, so a directory from which it can run is one that `list`
 * must be able to describe. The rows hold only what the filesystem knows: Everything else -- description,
 * checklist names, the readyup version against which a kit was built -- lives in the manifest that is absent.
 *
 * A source with neither a manifest nor a kit directory is still an error. Reporting "no kits" for a
 * path that does not exist would turn a mistyped `--from` into a clean, empty listing.
 */
function enumerateCompiledKits(kitsDir: string, manifestPath: string): JsonListKitEntry[] {
  if (!existsSync(kitsDir)) {
    const relManifest = path.relative(process.cwd(), manifestPath);
    const relKitsDir = path.relative(process.cwd(), kitsDir);
    throw configError(`No manifest found at ${relManifest}, and no kit directory at ${relKitsDir}.`);
  }

  let names: string[];
  try {
    names = enumerateKits({ dir: kitsDir, extension: '.js', recursive: true });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }

  return names.map((name) => ({
    name,
    kind: 'compiled',
    path: path.relative(process.cwd(), path.join(kitsDir, `${name}.js`)),
  }));
}

/** Reads a manifest, returning `undefined` where there is none and reporting any other failure. */
function readLocalManifestIfPresent(manifestPath: string): RdyManifest | undefined {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    if (error instanceof ManifestNotFoundError) return undefined;
    throw configError(describeError(error), { cause: error });
  }
}

/** Returns the directory in which a local `--from` source keeps its compiled kits, matching `run --from`. */
function resolveFromKitsDir(source: LocalFromSource): string {
  if (source.type === 'global') {
    return path.join(resolveHomeDir(), KITS_DIR);
  }

  if (source.type === 'directory') {
    return path.resolve(source.path);
  }

  // local path
  return path.join(path.resolve(source.path), KITS_DIR);
}

/** Returns the manifest path for a parsed local `--from` source. */
function resolveFromManifestPath(source: LocalFromSource): string {
  if (source.type === 'global') {
    return path.join(resolveHomeDir(), '.readyup/manifest.json');
  }

  if (source.type === 'directory') {
    return path.join(path.resolve(source.path), 'manifest.json');
  }

  // local path
  return path.join(path.resolve(source.path), '.readyup/manifest.json');
}

/**
 * Locates the package named by an `npm:` source whose kits are enumerated, rejecting what `run` rejects for it.
 *
 * Listing and running cover the same kits, so a spelling that one accepts and the other refuses would
 * send the reader looking for a difference that does not exist.
 */
function resolveSourcePackageRoot(source: NpmSource): string {
  if (source.versionSpec !== undefined) {
    throw usageError(
      `Naming a published version is not supported yet: "npm:${source.name}@${source.versionSpec}". ` +
        'Drop the version to use the installed copy.',
    );
  }

  const root = resolvePackageRoot(source.name);
  if (root === undefined) {
    throw kitLoadError(`Package "${source.name}" is not installed; it must be a direct dependency of this project.`);
  }
  return root;
}

// endregion | Helpers
