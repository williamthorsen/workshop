import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RepositoryProvenance } from '../../kits/KitProvenance.ts';
import { mockResponse } from '../../test-utils/mockResponse.ts';
import { diagnoseMissingRemoteKit, type MissingRemoteKit } from '../diagnoseMissingRemoteKit.ts';
import { RemoteFetchError } from '../RemoteFetchError.ts';

const KIT_URL = 'https://raw.githubusercontent.com/acme/kits/main/.readyup/kits/nope.js';
const MANIFEST_URL = 'https://raw.githubusercontent.com/acme/kits/main/.readyup/manifest.json';
const SPELLING_HINT = 'Check that the repository exists and that the ref names a branch, tag, or commit.';

const PROVENANCE: RepositoryProvenance = {
  kind: 'repository',
  host: 'github',
  owner: 'acme',
  repo: 'kits',
  ref: 'main',
  source: 'github:acme/kits',
};

describe(diagnoseMissingRemoteKit, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the kits that the manifest lists when it lacks the requested one', async () => {
    serveManifest({ version: 1, kits: [{ name: 'demo' }, { name: 'release' }] });

    const diagnosis = await diagnoseMissingRemoteKit(missing());

    expect(diagnosis?.code).toBe('kit-load');
    expect(diagnosis?.message).toBe(
      'Kit "nope" is not published by github:acme/kits@main. Available kits: demo, release.',
    );
    expect(diagnosis?.hint).toBe("Run `rdy list --from github:acme/kits` to see each kit's checklists.");
  });

  it('says that the manifest lists no kits when it is empty', async () => {
    serveManifest({ version: 1, kits: [] });

    const diagnosis = await diagnoseMissingRemoteKit(missing());

    expect(diagnosis?.message).toBe('Kit "nope" is not published by github:acme/kits@main. Its manifest lists none.');
  });

  it('reports a missing bundle when the manifest lists the requested kit', async () => {
    serveManifest({ version: 1, kits: [{ name: 'nope' }] });

    const diagnosis = await diagnoseMissingRemoteKit(missing());

    expect(diagnosis?.message).toBe(
      `The manifest of github:acme/kits@main lists kit "nope", but its bundle is missing at ${KIT_URL}.`,
    );
    expect(diagnosis?.hint).toBe(
      'Ask the publisher of github:acme/kits@main to commit the bundle that `rdy compile` writes.',
    );
  });

  it('suspects the repository or the ref when the source does not publish a manifest', async () => {
    stubFetch(mockResponse('', { status: 404, statusText: 'Not Found' }));

    const diagnosis = await diagnoseMissingRemoteKit(missing({ tokenForwarded: true }));

    expect(diagnosis?.message).toBe(
      `Kit "nope" not found at ${KIT_URL}, and github:acme/kits@main does not publish a manifest, ` +
        'so the repository or the ref "main" may not exist.',
    );
    expect(diagnosis?.hint).toBe(SPELLING_HINT);
  });

  it('adds the credential to the hint when no token was sent', async () => {
    stubFetch(mockResponse('', { status: 404, statusText: 'Not Found' }));

    const diagnosis = await diagnoseMissingRemoteKit(missing());

    expect(diagnosis?.hint).toBe(
      `${SPELLING_HINT} If the repository is private, set GITHUB_TOKEN or run \`gh auth login\`.`,
    );
  });

  it('attaches the kit fetch failure as the cause', async () => {
    serveManifest({ version: 1, kits: [] });
    const input = missing();

    const diagnosis = await diagnoseMissingRemoteKit(input);

    expect(diagnosis?.cause).toBe(input.error);
  });

  it.each([
    ['a server error', () => mockResponse('boom', { status: 500, statusText: 'Server Error' })],
    ['a malformed manifest', () => mockResponse('{ not json')],
  ])('declines to diagnose on %s', async (_case, respond) => {
    stubFetch(respond());

    await expect(diagnoseMissingRemoteKit(missing())).resolves.toBeUndefined();
  });

  it('reads the manifest at the source’s ref', async () => {
    serveManifest({ version: 1, kits: [] });

    await diagnoseMissingRemoteKit(missing());

    expect(fetch).toHaveBeenCalledWith(MANIFEST_URL, expect.anything());
  });
});

// region | Helpers

/** Builds an unauthenticated 404 for kit `nope` in `github:acme/kits`, which each test narrows. */
function missing(overrides: Partial<MissingRemoteKit> = {}): MissingRemoteKit {
  return {
    error: new RemoteFetchError(`Failed to fetch remote kit from ${KIT_URL}: 404 Not Found`, 404),
    kitName: 'nope',
    kitUrl: KIT_URL,
    provenance: PROVENANCE,
    provider: 'github',
    remote: { cache: undefined, resolveAuthHeaders: () => undefined },
    tokenForwarded: false,
    ...overrides,
  };
}

/** Serves the given manifest body at every URL. */
function serveManifest(manifest: unknown): void {
  stubFetch(mockResponse(JSON.stringify(manifest)));
}

/** Stubs the global fetch with one response. */
function stubFetch(response: ReturnType<typeof mockResponse>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  );
}

// endregion | Helpers
