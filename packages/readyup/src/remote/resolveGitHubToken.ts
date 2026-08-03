import { execFileSync } from 'node:child_process';

/**
 * Resolve a GitHub token from ambient sources for authenticating private repo fetches.
 *
 * Checks `GITHUB_TOKEN` env var first, then falls back to `gh auth token`.
 * Returns `undefined` when neither source produces a token.
 */
export function resolveGitHubToken(): string | undefined {
  const envToken = process.env.GITHUB_TOKEN;
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
