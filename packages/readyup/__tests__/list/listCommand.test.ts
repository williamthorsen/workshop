import assert from 'node:assert';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockEnumerateKits = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockResolveBitbucketToken = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('../../src/list/enumerateKits.ts', () => ({
  enumerateKits: mockEnumerateKits,
}));

vi.mock('../../src/loadConfig.ts', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock('../../src/manifest/readManifest.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

vi.mock('../../src/resolveBitbucketToken.ts', () => ({
  resolveBitbucketToken: mockResolveBitbucketToken,
}));

vi.mock('../../src/resolveGitHubToken.ts', () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.stubGlobal('fetch', mockFetch);

import { listCommand } from '../../src/list/listCommand.ts';
import { captureRdyError } from '../helpers/captureRdyError.ts';
import { mockResponse } from '../helpers/mockResponse.ts';

const validRemoteManifestBody = JSON.stringify({
  version: 1,
  kits: [{ name: 'default', description: 'General project health checks' }, { name: 'deploy' }],
});

describe(listCommand, () => {
  let stdoutSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    mockEnumerateKits.mockReturnValue([]);
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });
    mockResolveBitbucketToken.mockReturnValue(undefined);
    mockResolveGitHubToken.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockEnumerateKits.mockReset();
    mockLoadConfig.mockReset();
    mockReadManifest.mockReset();
    mockResolveBitbucketToken.mockReset();
    mockResolveGitHubToken.mockReset();
    mockFetch.mockReset();
  });

  it('with --from global, reads manifest from the home-based .readyup directory', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'default' }],
    });

    const exitCode = await listCommand(['--from', 'global']);

    expect(exitCode).toBe(0);
    const firstCall = mockReadManifest.mock.calls[0];
    assert.ok(firstCall, 'expected readManifest to have been called');
    const calledPath = String(firstCall[0]);
    expect(calledPath).toMatch(/\/.readyup\/manifest\.json$/);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('with --from dir:/some/path, reads manifest from the resolved directory', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'my-kit' }],
    });

    const exitCode = await listCommand(['--from', 'dir:/some/path']);

    expect(exitCode).toBe(0);
    const firstCall = mockReadManifest.mock.calls[0];
    assert.ok(firstCall, 'expected readManifest to have been called');
    const calledPath = String(firstCall[0]);
    expect(calledPath).toBe(path.join(path.resolve('/some/path'), 'manifest.json'));
    // Directory source does not append .readyup.
    expect(calledPath).not.toContain('.readyup');
  });

  it('with --from <local-path>, reads manifest from .readyup under the local path', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'default' }],
    });

    const exitCode = await listCommand(['--from', '/some/repo']);

    expect(exitCode).toBe(0);
    const firstCall = mockReadManifest.mock.calls[0];
    assert.ok(firstCall, 'expected readManifest to have been called');
    const calledPath = String(firstCall[0]);
    expect(calledPath).toBe(path.join(path.resolve('/some/repo'), '.readyup/manifest.json'));
  });

  it('reports a usage error for malformed --from values', async () => {
    const error = await captureRdyError(() => listCommand(['--from', 'https://example.com']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain('URLs are not accepted by --from');
    expect(mockReadManifest).not.toHaveBeenCalled();
  });

  it('with --from github:org/repo, fetches and renders the remote manifest', async () => {
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const exitCode = await listCommand(['--from', 'github:williamthorsen/workshop']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json',
      { headers: {} },
    );
    expect(mockReadManifest).not.toHaveBeenCalled();
    expect(mockLoadConfig).not.toHaveBeenCalled();

    const stdoutCalls = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stdoutCalls).toContain(
      'Manifest: https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json',
    );
    expect(stdoutCalls).toContain('default — General project health checks');
    expect(stdoutCalls).toContain('deploy');
  });

  it('with --from github:org/repo@ref, builds the URL using the supplied ref', async () => {
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const exitCode = await listCommand(['--from', 'github:williamthorsen/workshop@develop']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/williamthorsen/workshop/develop/.readyup/manifest.json',
      { headers: {} },
    );
  });

  it('with --from github:..., forwards the GitHub token as an Authorization header when available', async () => {
    mockResolveGitHubToken.mockReturnValue('my-token');
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const exitCode = await listCommand(['--from', 'github:williamthorsen/workshop']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json',
      { headers: { Authorization: 'token my-token' } },
    );
  });

  it('with --from github:... and a 404 response, reports a config error naming the URL', async () => {
    mockFetch.mockResolvedValue(mockResponse('Not Found', { status: 404, statusText: 'Not Found' }));

    const error = await captureRdyError(() => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'No manifest found at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json.',
    );
  });

  it('with --from github:... and an HTML soft-404 body, reports a config error naming the URL', async () => {
    mockFetch.mockResolvedValue(mockResponse('<!DOCTYPE html><html><body>Not Found</body></html>'));

    const error = await captureRdyError(() => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'No manifest found at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json.',
    );
  });

  it('with --from github:... and a malformed manifest, reports a config error naming the URL and "malformed"', async () => {
    mockFetch.mockResolvedValue(mockResponse('{ not valid json'));

    const error = await captureRdyError(() => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Manifest at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json is malformed:',
    );
  });

  it('with --from github:... and a schema-invalid manifest, reports a config error naming the URL and "malformed"', async () => {
    mockFetch.mockResolvedValue(mockResponse(JSON.stringify({ version: 1, kits: 'not-an-array' })));

    const error = await captureRdyError(() => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Manifest at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json is malformed:',
    );
  });

  it('with --from github:... and a 500 response, reports a config error naming the URL and status', async () => {
    mockFetch.mockResolvedValue(
      mockResponse('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );

    const error = await captureRdyError(() => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Failed to fetch manifest from https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json: 500 Internal Server Error',
    );
  });

  it('with --from github:... and a network failure, reports a config error naming the URL', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const error = await captureRdyError(() => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Failed to reach https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json',
    );
    expect(error.message).toContain('ECONNREFUSED');
  });

  it('with --from bitbucket:ws/repo, fetches and renders the remote manifest', async () => {
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const exitCode = await listCommand(['--from', 'bitbucket:tutorials/markdowndemo']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
      { headers: {} },
    );
    expect(mockReadManifest).not.toHaveBeenCalled();
    expect(mockLoadConfig).not.toHaveBeenCalled();

    const stdoutCalls = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stdoutCalls).toContain(
      'Manifest: https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
    );
    expect(stdoutCalls).toContain('default — General project health checks');
    expect(stdoutCalls).toContain('deploy');
  });

  it('with --from bitbucket:ws/repo@ref, builds the URL using the supplied ref', async () => {
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const exitCode = await listCommand(['--from', 'bitbucket:tutorials/markdowndemo@develop']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/develop/.readyup/manifest.json',
      { headers: {} },
    );
  });

  it('with --from bitbucket:..., forwards the Bitbucket token as a Bearer Authorization header when available', async () => {
    mockResolveBitbucketToken.mockReturnValue('bb-token');
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const exitCode = await listCommand(['--from', 'bitbucket:tutorials/markdowndemo']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
      { headers: { Authorization: 'Bearer bb-token' } },
    );
  });

  it('with --from bitbucket:... and BITBUCKET_TOKEN unset, omits the Authorization header', async () => {
    mockResolveBitbucketToken.mockReturnValue(undefined);
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const exitCode = await listCommand(['--from', 'bitbucket:tutorials/markdowndemo']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
      { headers: {} },
    );
  });

  it('with --from bitbucket:... and a 404 response, reports a config error naming the URL', async () => {
    mockFetch.mockResolvedValue(mockResponse('Not Found', { status: 404, statusText: 'Not Found' }));

    const error = await captureRdyError(() => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'No manifest found at https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json.',
    );
  });

  it('with --from bitbucket:... and a malformed manifest, reports a config error naming the URL and "malformed"', async () => {
    mockFetch.mockResolvedValue(mockResponse('{ not valid json'));

    const error = await captureRdyError(() => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Manifest at https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json is malformed:',
    );
  });

  it('with --from bitbucket:... and a schema-invalid manifest, reports a config error naming the URL and "malformed"', async () => {
    mockFetch.mockResolvedValue(mockResponse(JSON.stringify({ version: 1, kits: 'not-an-array' })));

    const error = await captureRdyError(() => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Manifest at https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json is malformed:',
    );
  });

  it('with --from bitbucket:... and a 500 response, reports a config error naming the URL and status', async () => {
    mockFetch.mockResolvedValue(
      mockResponse('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );

    const error = await captureRdyError(() => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Failed to fetch manifest from https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json: 500 Internal Server Error',
    );
  });

  it('with --from bitbucket:... and a network failure, reports a config error naming the URL', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const error = await captureRdyError(() => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Failed to reach https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
    );
    expect(error.message).toContain('ECONNREFUSED');
  });
});
