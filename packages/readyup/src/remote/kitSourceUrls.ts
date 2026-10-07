import { KITS_DIR } from '../kits/kitsDir.ts';
import type { BitbucketSource, GitHubSource } from '../kits/parseFromValue.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';

/** A kit source hosted in a repository, which readyup reads over the host's HTTP API. */
export type RepositorySource = BitbucketSource | GitHubSource;

/** Builds the URL from which a repository source's compiled kit is fetched. */
export function buildRepositoryKitUrl(source: RepositorySource, kitName: string, extension: string): string {
  return buildRepositoryFileUrl(source, `${KITS_DIR}/${kitName}${extension}`);
}

/** Builds the URL from which a repository source's manifest is fetched. */
export function buildRepositoryManifestUrl(source: RepositorySource): string {
  return buildRepositoryFileUrl(source, DEFAULT_MANIFEST_PATH);
}

// region | Helpers

/** Builds the URL of a file at a repository-relative path, on the host's raw-content endpoint. */
function buildRepositoryFileUrl(source: RepositorySource, filePath: string): string {
  if (source.type === 'github') {
    return `https://raw.githubusercontent.com/${source.org}/${source.repo}/${source.ref}/${filePath}`;
  }
  return `https://api.bitbucket.org/2.0/repositories/${source.workspace}/${source.repo}/src/${source.ref}/${filePath}`;
}

// endregion | Helpers
