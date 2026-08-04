import { configError, kitLoadError, type RdyError } from '../errors.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { RemoteManifestNotFoundError } from './loadRemoteManifest.ts';
import type { RemoteProvider } from './remote-provider.ts';
import { RemoteFetchError } from './RemoteFetchError.ts';

/** Statuses a provider answers with when a credential would have made the difference. */
const CREDENTIAL_STATUSES = new Set([401, 403, 404]);

/**
 * Remediation a provider's credential failure calls for.
 *
 * Phrased conditionally because 404 is genuinely ambiguous: GitHub answers it for a private
 * repository fetched anonymously as well as for one that does not exist, so the hint must not assert
 * which case the reader is in.
 */
const CREDENTIAL_HINTS: Record<RemoteProvider, string> = {
  bitbucket: 'If the repository is private, set BITBUCKET_TOKEN.',
  github: 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.',
};

export interface RemoteFailureContext {
  /** How the calling command classifies a remote fetch it could not complete. */
  code: 'config' | 'kit-load';

  provider: RemoteProvider | undefined;

  /** Whether an `Authorization` header was actually sent, rather than whether a token could be resolved. */
  tokenForwarded: boolean;

  url: string;
}

/**
 * Diagnoses a failed remote fetch, attaching a credential hint where one would help.
 *
 * Shared by listing and running, which classify the same failure under different codes and otherwise
 * treat it identically.
 */
export function toRemoteRdyError(error: unknown, context: RemoteFailureContext): RdyError {
  const build = context.code === 'config' ? configError : kitLoadError;

  if (error instanceof RemoteManifestNotFoundError) {
    // GitHub serves a private repository's manifest as absent, so this is the same failure a 404 is.
    return build(`No manifest found at ${context.url}.`, { cause: error, hint: resolveHint(context, 404) });
  }

  if (error instanceof RemoteFetchError) {
    return build(error.message, { cause: error, hint: resolveHint(context, error.status) });
  }

  // A transport failure carries no status to reason about and no URL of its own, so it is never
  // hinted and needs the URL supplied.
  const message = extractMessage(error);
  const detail = message.includes(context.url) ? message : `Failed to reach ${context.url}: ${message}`;
  return build(detail, { cause: error });
}

// region | Helpers

/** Names the credential the reader is missing, or `undefined` when a credential is not what failed. */
function resolveHint(context: RemoteFailureContext, status: number): string | undefined {
  if (context.provider === undefined || context.tokenForwarded) return undefined;
  return CREDENTIAL_STATUSES.has(status) ? CREDENTIAL_HINTS[context.provider] : undefined;
}

// endregion | Helpers
