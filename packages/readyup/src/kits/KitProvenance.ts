import type { BitbucketSource, GitHubSource } from './parseFromValue.ts';

/**
 * Where a kit came from, absent only for a kit resolved from the local kits directory.
 *
 * Four kinds, though `--from` accepts six: The six collapse onto the roles that a heading can name, and
 * nothing should record a distinction that no reader ever sees. A source kind introduced later must be
 * added to this union and to the branch that renders it.
 *
 * `source` on a package or repository kit is the kit source as the reader wrote it, in the config or on
 * the command line, which is how the JSON report identifies the kit's origin.
 */
export type KitProvenance =
  | RepositoryProvenance
  | { kind: 'directory'; label: string }
  | { kind: 'package'; packageName: string; version: string | undefined; source: string }
  | { kind: 'remote'; label: string };

/** A kit fetched from a repository named by a `github:` or `bitbucket:` source. */
export interface RepositoryProvenance {
  kind: 'repository';
  host: 'bitbucket' | 'github';
  owner: string;
  repo: string;
  ref: string;
  source: string;
}

/** Records where a repository kit came from, in the structured form that check-ID namespacing reads. */
export function buildRepositoryProvenance(
  source: BitbucketSource | GitHubSource,
  spelling: string,
): RepositoryProvenance {
  const owner = source.type === 'github' ? source.org : source.workspace;
  return { kind: 'repository', host: source.type, owner, repo: source.repo, ref: source.ref, source: spelling };
}

/** Returns a repository kit's source with its ref resolved, as a heading names it: `github:org/repo@ref`. */
export function formatRepositoryLabel(provenance: RepositoryProvenance): string {
  return `${provenance.host}:${provenance.owner}/${provenance.repo}@${provenance.ref}`;
}
