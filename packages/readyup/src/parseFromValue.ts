/** Parsed result for the `github:` scheme. */
export interface GitHubSource {
  type: 'github';
  org: string;
  repo: string;
  ref: string;
}

/** Parsed result for the `bitbucket:` scheme. */
export interface BitbucketSource {
  type: 'bitbucket';
  workspace: string;
  repo: string;
  ref: string;
}

/** Parsed result for the `global` keyword. */
export interface GlobalSource {
  type: 'global';
}

/** Parsed result for the `dir:` scheme. */
export interface DirectorySource {
  type: 'directory';
  path: string;
}

/** Parsed result for a local repo path (fallback). */
export interface LocalSource {
  type: 'local';
  path: string;
}

/** Discriminated union of all `--from` value interpretations. */
export type FromSource = GitHubSource | BitbucketSource | GlobalSource | DirectorySource | LocalSource;

/**
 * Parse `owner/name[@ref]` into owner, name, and ref components.
 *
 * The `@ref` part is optional; defaults to `main`.
 */
function parseOrgRepo(value: string): { owner: string; name: string; ref: string } {
  const atIndex = value.lastIndexOf('@');
  const slug = atIndex === -1 ? value : value.slice(0, atIndex);
  const ref = atIndex === -1 ? 'main' : value.slice(atIndex + 1);

  if (ref === '') {
    throw new Error(`Invalid --from value: ref after '@' must not be empty in "${value}"`);
  }

  const slashIndex = slug.indexOf('/');
  if (slashIndex === -1 || slashIndex === 0 || slashIndex === slug.length - 1) {
    throw new Error(`Invalid --from value: expected "owner/repo" format, got "${slug}"`);
  }

  return { owner: slug.slice(0, slashIndex), name: slug.slice(slashIndex + 1), ref };
}

/** Parse the `--from` flag value into a discriminated source union. */
export function parseFromValue(value: string): FromSource {
  if (value.startsWith('github:')) {
    const body = value.slice('github:'.length);
    const { owner, name, ref } = parseOrgRepo(body);
    return { type: 'github', org: owner, repo: name, ref };
  }

  if (value.startsWith('bitbucket:')) {
    const body = value.slice('bitbucket:'.length);
    const { owner, name, ref } = parseOrgRepo(body);
    return { type: 'bitbucket', workspace: owner, repo: name, ref };
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    throw new Error(`URLs are not accepted by --from. Use --url instead: ${value}`);
  }

  if (value === 'global') {
    return { type: 'global' };
  }

  if (value.startsWith('dir:')) {
    return { type: 'directory', path: value.slice('dir:'.length) };
  }

  return { type: 'local', path: value };
}
