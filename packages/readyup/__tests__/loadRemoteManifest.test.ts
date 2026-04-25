import { afterEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

import { loadRemoteManifest, RemoteManifestNotFoundError } from '../src/loadRemoteManifest.ts';
import { mockResponse } from './helpers/mockResponse.ts';

const validManifestBody = JSON.stringify({
  version: 1,
  kits: [{ name: 'default', description: 'General project health checks' }, { name: 'deploy' }],
});

describe(loadRemoteManifest, () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('returns parsed manifest on 200 with a valid body', async () => {
    mockFetch.mockResolvedValue(mockResponse(validManifestBody));

    const manifest = await loadRemoteManifest({ url: 'https://example.com/manifest.json' });

    expect(manifest.version).toBe(1);
    expect(manifest.kits).toHaveLength(2);
    expect(manifest.kits[0]?.name).toBe('default');
    expect(manifest.kits[0]?.description).toBe('General project health checks');
    expect(manifest.kits[1]?.name).toBe('deploy');
  });

  it('throws RemoteManifestNotFoundError on 404', async () => {
    mockFetch.mockResolvedValue(mockResponse('Not Found', { status: 404, statusText: 'Not Found' }));

    await expect(loadRemoteManifest({ url: 'https://example.com/manifest.json' })).rejects.toBeInstanceOf(
      RemoteManifestNotFoundError,
    );
  });

  it('throws RemoteManifestNotFoundError when response body is an HTML page with <!doctype', async () => {
    mockFetch.mockResolvedValue(mockResponse('<!DOCTYPE html><html><body>Not Found</body></html>'));

    await expect(loadRemoteManifest({ url: 'https://example.com/manifest.json' })).rejects.toBeInstanceOf(
      RemoteManifestNotFoundError,
    );
  });

  it('throws RemoteManifestNotFoundError when response body starts with <html', async () => {
    mockFetch.mockResolvedValue(mockResponse('<html><body>Not Found</body></html>'));

    await expect(loadRemoteManifest({ url: 'https://example.com/manifest.json' })).rejects.toBeInstanceOf(
      RemoteManifestNotFoundError,
    );
  });

  it('throws plain Error containing URL and status for non-404 non-2xx responses', async () => {
    mockFetch.mockResolvedValue(mockResponse('boom', { status: 500, statusText: 'Internal Server Error' }));

    await expect(loadRemoteManifest({ url: 'https://example.com/manifest.json' })).rejects.toThrow(
      'Failed to fetch manifest from https://example.com/manifest.json: 500 Internal Server Error',
    );
  });

  it('throws Error containing URL and "malformed" for invalid JSON', async () => {
    mockFetch.mockResolvedValue(mockResponse('{ not valid json'));

    await expect(loadRemoteManifest({ url: 'https://example.com/manifest.json' })).rejects.toThrow(
      /Manifest at https:\/\/example\.com\/manifest\.json is malformed:/,
    );
  });

  it('throws Error containing URL and "malformed" for schema-invalid JSON', async () => {
    mockFetch.mockResolvedValue(mockResponse(JSON.stringify({ version: 2, kits: [] })));

    await expect(loadRemoteManifest({ url: 'https://example.com/manifest.json' })).rejects.toThrow(
      /Manifest at https:\/\/example\.com\/manifest\.json is malformed:/,
    );
  });

  it('sends Authorization header when token is provided', async () => {
    mockFetch.mockResolvedValue(mockResponse(validManifestBody));

    await loadRemoteManifest({ url: 'https://example.com/manifest.json', token: 'my-token' });

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/manifest.json', {
      headers: { Authorization: 'token my-token' },
    });
  });

  it('omits Authorization header when no token is provided', async () => {
    mockFetch.mockResolvedValue(mockResponse(validManifestBody));

    await loadRemoteManifest({ url: 'https://example.com/manifest.json' });

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/manifest.json', {
      headers: {},
    });
  });

  it('propagates network errors from fetch', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(loadRemoteManifest({ url: 'https://example.com/manifest.json' })).rejects.toThrow('ECONNREFUSED');
  });
});
