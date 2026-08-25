import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockMkdtempSync = vi.hoisted(() => vi.fn());
const mockRmSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('node:fs'), () => ({
  mkdtempSync: mockMkdtempSync,
  rmSync: mockRmSync,
  writeFileSync: mockWriteFileSync,
}));

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

import { mockResponse } from '../../test-utils/mockResponse.ts';
import { loadRemoteKit } from '../loadRemoteKit.ts';
import { RemoteFetchError } from '../RemoteFetchError.ts';

describe(loadRemoteKit, () => {
  afterEach(() => {
    mockMkdtempSync.mockReset();
    mockRmSync.mockReset();
    mockWriteFileSync.mockReset();
    mockFetch.mockReset();
  });

  it('throws on non-2xx responses', async () => {
    mockFetch.mockResolvedValue(mockResponse('Not Found', { status: 404, statusText: 'Not Found' }));

    await expect(loadRemoteKit({ url: 'https://example.com/config.js' })).rejects.toThrow(
      'Failed to fetch remote kit from https://example.com/config.js: 404 Not Found',
    );
  });

  it.each([401, 403, 404])('throws RemoteFetchError with the %i status', async (status) => {
    mockFetch.mockResolvedValue(mockResponse('Nope', { status, statusText: 'Nope' }));

    const error = await captureError(RemoteFetchError, () => loadRemoteKit({ url: 'https://example.com/config.js' }));

    expect(error).toHaveProperty('status', status);
  });

  it('detects HTML error pages', async () => {
    mockFetch.mockResolvedValue(mockResponse('<!DOCTYPE html><html><body>Error</body></html>'));

    await expect(loadRemoteKit({ url: 'https://example.com/config.js' })).rejects.toThrow(
      'Remote kit URL returned an HTML page instead of JavaScript',
    );
  });

  it('detects HTML pages with <html prefix', async () => {
    mockFetch.mockResolvedValue(mockResponse('<html><body>Error</body></html>'));

    await expect(loadRemoteKit({ url: 'https://example.com/config.js' })).rejects.toThrow(
      'Remote kit URL returned an HTML page instead of JavaScript',
    );
  });

  it('forwards supplied headers to fetch', async () => {
    mockFetch.mockResolvedValue(mockResponse('Not Found', { status: 404, statusText: 'Not Found' }));

    await captureError(() =>
      loadRemoteKit({
        url: 'https://example.com/config.js',
        headers: { Authorization: 'Bearer my-token', 'X-Custom': 'value' },
      }),
    );

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/config.js', {
      headers: { Authorization: 'Bearer my-token', 'X-Custom': 'value' },
    });
  });

  it('calls fetch with empty headers when none are provided', async () => {
    mockFetch.mockResolvedValue(mockResponse('Not Found', { status: 404, statusText: 'Not Found' }));

    await captureError(() => loadRemoteKit({ url: 'https://example.com/config.js' }));

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/config.js', {
      headers: {},
    });
  });

  it('cleans up temp directory even on failure', async () => {
    mockFetch.mockResolvedValue(mockResponse('export default {};'));
    mockMkdtempSync.mockReturnValue('/tmp/rdy-abc');
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('disk full');
    });

    await expect(loadRemoteKit({ url: 'https://example.com/config.js' })).rejects.toThrow('disk full');

    expect(mockRmSync).toHaveBeenCalledWith('/tmp/rdy-abc', { recursive: true, force: true });
  });
});
