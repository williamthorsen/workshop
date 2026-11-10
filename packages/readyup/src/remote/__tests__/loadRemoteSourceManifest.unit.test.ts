import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

import { RdyError } from '../../errors/RdyError.ts';
import { mockResponse } from '../../test-utils/mockResponse.ts';
import type { RemoteFetchContext } from '../createRemoteFetchContext.ts';
import { loadRemoteSourceManifest } from '../loadRemoteSourceManifest.ts';

const GITHUB_URL = 'https://raw.githubusercontent.com/acme/kits/HEAD/.readyup/manifest.json';
const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';
const AUTH_HEADERS = { Authorization: 'token abc' };

const validManifestBody = JSON.stringify({ version: 1, kits: [{ name: 'default' }] });

describe(loadRemoteSourceManifest, () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('returns the parsed manifest', async () => {
    mockFetch.mockResolvedValue(mockResponse(validManifestBody));

    const manifest = await loadRemoteSourceManifest(GITHUB_URL, createContext(undefined));

    expect(manifest.kits.map((kit) => kit.name)).toStrictEqual(['default']);
  });

  it("sends the headers that the context resolves for the URL's provider", async () => {
    mockFetch.mockResolvedValue(mockResponse(validManifestBody));
    const remote = createContext(AUTH_HEADERS);

    await loadRemoteSourceManifest(GITHUB_URL, remote);

    expect(remote.resolveAuthHeaders).toHaveBeenCalledWith('github');
    expect(mockFetch).toHaveBeenCalledWith(GITHUB_URL, { headers: AUTH_HEADERS, signal: expect.any(AbortSignal) });
  });

  it('throws a config error with the credential hint when no token was sent', async () => {
    mockFetch.mockResolvedValue(mockResponse('Unauthorized', { status: 401, statusText: 'Unauthorized' }));

    const error = await captureError(RdyError, () => loadRemoteSourceManifest(GITHUB_URL, createContext(undefined)));

    expect(error.code).toBe('config');
    expect(error.hint).toBe(GITHUB_HINT);
  });

  it('throws a config error without a credential hint when a token was sent', async () => {
    mockFetch.mockResolvedValue(mockResponse('Unauthorized', { status: 401, statusText: 'Unauthorized' }));

    const error = await captureError(RdyError, () => loadRemoteSourceManifest(GITHUB_URL, createContext(AUTH_HEADERS)));

    expect(error.code).toBe('config');
    expect(error.hint).toBeUndefined();
  });
});

// region | Helpers

/** Builds an uncached fetch context whose credential resolver returns `headers` for every provider. */
function createContext(headers: Record<string, string> | undefined): RemoteFetchContext {
  return { cache: undefined, resolveAuthHeaders: vi.fn(() => headers) };
}

// endregion | Helpers
