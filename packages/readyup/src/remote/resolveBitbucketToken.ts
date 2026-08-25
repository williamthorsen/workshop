/**
 * Returns a Bitbucket token from ambient sources, for authenticating a private repo fetch, or
 * `undefined` where none is set.
 *
 * The `BITBUCKET_TOKEN` env var is the only source: no Bitbucket CLI is widely deployed with a stable
 * `auth token` equivalent, Atlassian's `acli` being Jira- and Confluence-centric.
 */
export function resolveBitbucketToken(): string | undefined {
  const envToken = process.env['BITBUCKET_TOKEN'];
  if (envToken !== undefined && envToken !== '') {
    return envToken;
  }
  return undefined;
}
