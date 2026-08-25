import { describe, expect, it } from 'vitest';

import { RemoteManifestNotFoundError } from '../loadRemoteManifest.ts';
import type { RemoteProvider } from '../remote-provider.ts';
import { RemoteFetchError } from '../RemoteFetchError.ts';
import { type RemoteFailureContext, toRemoteRdyError } from '../toRemoteRdyError.ts';

const GITHUB_URL = 'https://raw.githubusercontent.com/acme/kits/HEAD/.readyup/manifest.json';
const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';
const BITBUCKET_HINT = 'If the repository is private, set BITBUCKET_TOKEN.';

const PROVIDER_HINTS: Array<{ hint: string; provider: RemoteProvider }> = [
  { provider: 'bitbucket', hint: BITBUCKET_HINT },
  { provider: 'github', hint: GITHUB_HINT },
];

describe(toRemoteRdyError, () => {
  describe('classification', () => {
    it.each(['config', 'kit-load'] as const)('reports the failure under the caller’s %s code', (code) => {
      const error = toRemoteRdyError(new RemoteFetchError('boom', 500), context({ code }));

      expect(error.code).toBe(code);
    });

    it('names the URL for a missing manifest', () => {
      const error = toRemoteRdyError(new RemoteManifestNotFoundError(GITHUB_URL), context());

      expect(error.message).toBe(`No manifest found at ${GITHUB_URL}.`);
    });

    it('preserves a fetch failure’s message verbatim', () => {
      const error = toRemoteRdyError(new RemoteFetchError('Failed to fetch manifest: 500 Boom', 500), context());

      expect(error.message).toBe('Failed to fetch manifest: 500 Boom');
    });

    it('supplies the URL for a transport failure, which has none', () => {
      const error = toRemoteRdyError(new Error('ECONNREFUSED'), context());

      expect(error.message).toBe(`Failed to reach ${GITHUB_URL}: ECONNREFUSED`);
    });

    it('leaves a transport failure that already names the URL alone', () => {
      const error = toRemoteRdyError(new Error(`socket hang up on ${GITHUB_URL}`), context());

      expect(error.message).toBe(`socket hang up on ${GITHUB_URL}`);
    });

    it('attaches the thrown value as the cause', () => {
      const thrown = new RemoteFetchError('boom', 500);

      expect(toRemoteRdyError(thrown, context()).cause).toBe(thrown);
    });
  });

  describe('credential hint', () => {
    it.each(PROVIDER_HINTS)('names the $provider credential', ({ hint, provider }) => {
      const error = toRemoteRdyError(new RemoteFetchError('boom', 401), context({ provider }));

      expect(error.hint).toBe(hint);
    });

    it.each([401, 403, 404])('hints on %i, where a credential would have made the difference', (status) => {
      expect(toRemoteRdyError(new RemoteFetchError('boom', status), context()).hint).toBe(GITHUB_HINT);
    });

    // GitHub serves a private repository's manifest as absent, so the soft-404 path has to hint too
    // or the GitHub arm would never reach one.
    it('hints on a missing manifest, which is how GitHub reports a private repository', () => {
      const error = toRemoteRdyError(new RemoteManifestNotFoundError(GITHUB_URL), context());

      expect(error.hint).toBe(GITHUB_HINT);
    });

    it.each([400, 418, 500, 502])('stays silent on %i, which no credential would fix', (status) => {
      expect(toRemoteRdyError(new RemoteFetchError('boom', status), context()).hint).toBeUndefined();
    });

    it('stays silent when a credential was already forwarded', () => {
      const error = toRemoteRdyError(new RemoteFetchError('boom', 403), context({ tokenForwarded: true }));

      expect(error.hint).toBeUndefined();
    });

    it('stays silent for a host readyup does not authenticate', () => {
      const error = toRemoteRdyError(new RemoteFetchError('boom', 401), context({ provider: undefined }));

      expect(error.hint).toBeUndefined();
    });

    it('stays silent for a transport failure, which reached no host to be refused by', () => {
      expect(toRemoteRdyError(new Error('ECONNREFUSED'), context()).hint).toBeUndefined();
    });

    it('stays silent for a malformed body, which arrived over an accepted request', () => {
      const error = toRemoteRdyError(new Error(`Manifest at ${GITHUB_URL} is malformed: bad JSON`), context());

      expect(error.hint).toBeUndefined();
    });
  });
});

// region | Helpers

/** Builds an unauthenticated GitHub listing context, which each test narrows to the case it covers. */
function context(overrides: Partial<RemoteFailureContext> = {}): RemoteFailureContext {
  return { code: 'config', provider: 'github', tokenForwarded: false, url: GITHUB_URL, ...overrides };
}

// endregion | Helpers
