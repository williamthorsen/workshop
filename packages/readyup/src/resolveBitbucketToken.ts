/**
 * Resolve a Bitbucket token from ambient sources for authenticating private repo fetches.
 *
 * Checks the `BITBUCKET_TOKEN` env var only — there is no widely-deployed Bitbucket CLI
 * with a stable `auth token` equivalent (Atlassian's `acli` is Jira/Confluence-centric).
 * Returns `undefined` when the env var is unset or empty.
 */
export function resolveBitbucketToken(): string | undefined {
  const envToken = process.env.BITBUCKET_TOKEN;
  if (envToken !== undefined && envToken !== '') {
    return envToken;
  }
  return undefined;
}
