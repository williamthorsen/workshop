import { execFileSync } from 'node:child_process';

/**
 * Returns a GitHub token from ambient sources, for authenticating a private repo fetch, or
 * `undefined` where neither source produces one.
 *
 * The `GITHUB_TOKEN` env var is read first, then `gh auth token`.
 */
export function resolveGitHubToken(): string | undefined {
  const envToken = process.env['GITHUB_TOKEN'];
  if (envToken !== undefined && envToken !== '') {
    return envToken;
  }

  try {
    const output = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = output.trim();
    if (trimmed !== '') {
      return trimmed;
    }
  } catch {
    // gh CLI not installed or not logged in
  }

  return undefined;
}
