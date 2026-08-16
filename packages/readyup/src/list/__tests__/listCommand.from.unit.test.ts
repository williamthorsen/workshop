import assert from 'node:assert';
import path from 'node:path';

import { captureError, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnumerateKits = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockResolveBitbucketToken = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock(import('../enumerateKits.ts'), () => ({
  enumerateKits: mockEnumerateKits,
}));

vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return {
    DEFAULT_CONFIG: actual.DEFAULT_CONFIG,
    loadConfig: mockLoadConfig,
  };
});

vi.mock(import('../../manifest/readManifest.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

vi.mock(import('../../remote/resolveBitbucketToken.ts'), () => ({
  resolveBitbucketToken: mockResolveBitbucketToken,
}));

vi.mock(import('../../remote/resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.stubGlobal('fetch', mockFetch);

import { RdyError } from '../../errors/RdyError.ts';
import { mockResponse } from '../../test-utils/mockResponse.ts';
import { listCommand } from '../listCommand.ts';

const validRemoteManifestBody = JSON.stringify({
  version: 1,
  kits: [{ name: 'default', description: 'General project health checks' }, { name: 'deploy' }],
});

describe(listCommand, () => {
  beforeEach(() => {
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

    const { exitCode, stdoutChunks } = await list(['--from', 'global']);

    expect(exitCode).toBe(0);
    const firstCall = mockReadManifest.mock.calls[0];
    assert.ok(firstCall, 'expected readManifest to have been called');
    const calledPath = String(firstCall[0]);
    expect(calledPath).toMatch(/\/.readyup\/manifest\.json$/);
    expect(stdoutChunks).toHaveLength(1);
  });

  it('with --from dir:/some/path, reads manifest from the resolved directory', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'my-kit' }],
    });

    const { exitCode } = await list(['--from', 'dir:/some/path']);

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

    const { exitCode } = await list(['--from', '/some/repo']);

    expect(exitCode).toBe(0);
    const firstCall = mockReadManifest.mock.calls[0];
    assert.ok(firstCall, 'expected readManifest to have been called');
    const calledPath = String(firstCall[0]);
    expect(calledPath).toBe(path.join(path.resolve('/some/repo'), '.readyup/manifest.json'));
  });

  it('reports a usage error for malformed --from values', async () => {
    const error = await captureError(RdyError, () => listCommand(['--from', 'https://example.com']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain('URLs are not accepted by --from');
    expect(mockReadManifest).not.toHaveBeenCalled();
  });

  it('with --from github:org/repo, fetches and renders the remote manifest', async () => {
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const { exitCode, stdout } = await list(['--from', 'github:williamthorsen/workshop']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json',
      { headers: {} },
    );
    expect(mockReadManifest).not.toHaveBeenCalled();
    expect(mockLoadConfig).not.toHaveBeenCalled();

    expect(stdout).toContain(
      'Manifest: https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json',
    );
    expect(stdout).toContain('default \u{00B7} General project health checks');
    expect(stdout).toContain('deploy');
  });

  it('with --from github:org/repo@ref, builds the URL using the supplied ref', async () => {
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const { exitCode } = await list(['--from', 'github:williamthorsen/workshop@develop']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/williamthorsen/workshop/develop/.readyup/manifest.json',
      { headers: {} },
    );
  });

  it('with --from github:..., forwards the GitHub token as an Authorization header when available', async () => {
    mockResolveGitHubToken.mockReturnValue('my-token');
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const { exitCode } = await list(['--from', 'github:williamthorsen/workshop']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json',
      { headers: { Authorization: 'token my-token' } },
    );
  });

  it('with --from github:... and a 404 response, reports a config error naming the URL', async () => {
    mockFetch.mockResolvedValue(mockResponse('Not Found', { status: 404, statusText: 'Not Found' }));

    const error = await captureError(RdyError, () => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'No manifest found at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json.',
    );
  });

  it('with --from github:... and an HTML soft-404 body, reports a config error naming the URL', async () => {
    mockFetch.mockResolvedValue(mockResponse('<!DOCTYPE html><html><body>Not Found</body></html>'));

    const error = await captureError(RdyError, () => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'No manifest found at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json.',
    );
  });

  it('with --from github:... and a malformed manifest, reports a config error naming the URL and "malformed"', async () => {
    mockFetch.mockResolvedValue(mockResponse('{ not valid json'));

    const error = await captureError(RdyError, () => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Manifest at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json is malformed:',
    );
  });

  it('with --from github:... and a schema-invalid manifest, reports a config error naming the URL and "malformed"', async () => {
    mockFetch.mockResolvedValue(mockResponse(JSON.stringify({ version: 1, kits: 'not-an-array' })));

    const error = await captureError(RdyError, () => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Manifest at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json is malformed:',
    );
  });

  it('with --from github:... and a 500 response, reports a config error naming the URL and status', async () => {
    mockFetch.mockResolvedValue(
      mockResponse('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );

    const error = await captureError(RdyError, () => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Failed to fetch manifest from https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json: 500 Internal Server Error',
    );
  });

  it('with --from github:... and a network failure, reports a config error naming the URL', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const error = await captureError(RdyError, () => listCommand(['--from', 'github:williamthorsen/workshop']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Failed to reach https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json',
    );
    expect(error.message).toContain('ECONNREFUSED');
  });

  describe('credential hints', () => {
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';
    const BITBUCKET_HINT = 'If the repository is private, set BITBUCKET_TOKEN.';

    it.each([401, 403, 404])('hints at GITHUB_TOKEN on an unauthenticated %i from GitHub', async (status) => {
      mockFetch.mockResolvedValue(mockResponse('Nope', { status, statusText: 'Nope' }));

      const error = await captureError(RdyError, () => listCommand(['--from', 'github:acme/private']));

      expect(error.hint).toBe(GITHUB_HINT);
    });

    it('hints on the HTML soft-404 GitHub serves for a private repository', async () => {
      mockFetch.mockResolvedValue(mockResponse('<!DOCTYPE html><html><body>Not Found</body></html>'));

      const error = await captureError(RdyError, () => listCommand(['--from', 'github:acme/private']));

      expect(error.hint).toBe(GITHUB_HINT);
    });

    it.each([401, 403, 404])('hints at BITBUCKET_TOKEN on an unauthenticated %i from Bitbucket', async (status) => {
      mockFetch.mockResolvedValue(mockResponse('Nope', { status, statusText: 'Nope' }));

      const error = await captureError(RdyError, () => listCommand(['--from', 'bitbucket:acme/private']));

      expect(error.hint).toBe(BITBUCKET_HINT);
    });

    it('leaves the message untouched, carrying the hint beside it', async () => {
      mockFetch.mockResolvedValue(mockResponse('Nope', { status: 401, statusText: 'Unauthorized' }));

      const error = await captureError(RdyError, () => listCommand(['--from', 'github:acme/private']));

      expect(error.message).toBe(
        'Failed to fetch manifest from https://raw.githubusercontent.com/acme/private/main/.readyup/manifest.json: 401 Unauthorized',
      );
    });

    it('stays silent when a token was forwarded', async () => {
      mockResolveGitHubToken.mockReturnValue('my-token');
      mockFetch.mockResolvedValue(mockResponse('Nope', { status: 404, statusText: 'Not Found' }));

      const error = await captureError(RdyError, () => listCommand(['--from', 'github:acme/private']));

      expect(error.hint).toBeUndefined();
    });

    it.each([500, 502])('stays silent on a %i, which no credential would fix', async (status) => {
      mockFetch.mockResolvedValue(mockResponse('boom', { status, statusText: 'Server Error' }));

      const error = await captureError(RdyError, () => listCommand(['--from', 'github:acme/private']));

      expect(error.hint).toBeUndefined();
    });

    it('stays silent on a malformed body, which arrived over an accepted request', async () => {
      mockFetch.mockResolvedValue(mockResponse('{ not valid json'));

      const error = await captureError(RdyError, () => listCommand(['--from', 'github:acme/private']));

      expect(error.hint).toBeUndefined();
    });

    it('stays silent on a network failure, which reached no host to be refused by', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const error = await captureError(RdyError, () => listCommand(['--from', 'github:acme/private']));

      expect(error.hint).toBeUndefined();
    });
  });

  it('with --from bitbucket:ws/repo, fetches and renders the remote manifest', async () => {
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const { exitCode, stdout } = await list(['--from', 'bitbucket:tutorials/markdowndemo']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
      { headers: {} },
    );
    expect(mockReadManifest).not.toHaveBeenCalled();
    expect(mockLoadConfig).not.toHaveBeenCalled();

    expect(stdout).toContain(
      'Manifest: https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
    );
    expect(stdout).toContain('default \u{00B7} General project health checks');
    expect(stdout).toContain('deploy');
  });

  it('with --from bitbucket:ws/repo@ref, builds the URL using the supplied ref', async () => {
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const { exitCode } = await list(['--from', 'bitbucket:tutorials/markdowndemo@develop']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/develop/.readyup/manifest.json',
      { headers: {} },
    );
  });

  it('with --from bitbucket:..., forwards the Bitbucket token as a Bearer Authorization header when available', async () => {
    mockResolveBitbucketToken.mockReturnValue('bb-token');
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const { exitCode } = await list(['--from', 'bitbucket:tutorials/markdowndemo']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
      { headers: { Authorization: 'Bearer bb-token' } },
    );
  });

  it('with --from bitbucket:... and BITBUCKET_TOKEN unset, omits the Authorization header', async () => {
    mockResolveBitbucketToken.mockReturnValue(undefined);
    mockFetch.mockResolvedValue(mockResponse(validRemoteManifestBody));

    const { exitCode } = await list(['--from', 'bitbucket:tutorials/markdowndemo']);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
      { headers: {} },
    );
  });

  it('with --from bitbucket:... and a 404 response, reports a config error naming the URL', async () => {
    mockFetch.mockResolvedValue(mockResponse('Not Found', { status: 404, statusText: 'Not Found' }));

    const error = await captureError(RdyError, () => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'No manifest found at https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json.',
    );
  });

  it('with --from bitbucket:... and a malformed manifest, reports a config error naming the URL and "malformed"', async () => {
    mockFetch.mockResolvedValue(mockResponse('{ not valid json'));

    const error = await captureError(RdyError, () => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Manifest at https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json is malformed:',
    );
  });

  it('with --from bitbucket:... and a schema-invalid manifest, reports a config error naming the URL and "malformed"', async () => {
    mockFetch.mockResolvedValue(mockResponse(JSON.stringify({ version: 1, kits: 'not-an-array' })));

    const error = await captureError(RdyError, () => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Manifest at https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json is malformed:',
    );
  });

  it('with --from bitbucket:... and a 500 response, reports a config error naming the URL and status', async () => {
    mockFetch.mockResolvedValue(
      mockResponse('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );

    const error = await captureError(RdyError, () => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Failed to fetch manifest from https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json: 500 Internal Server Error',
    );
  });

  it('with --from bitbucket:... and a network failure, reports a config error naming the URL', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const error = await captureError(RdyError, () => listCommand(['--from', 'bitbucket:tutorials/markdowndemo']));

    expect(error.code).toBe('config');
    expect(error.message).toContain(
      'Failed to reach https://api.bitbucket.org/2.0/repositories/tutorials/markdowndemo/src/main/.readyup/manifest.json',
    );
    expect(error.message).toContain('ECONNREFUSED');
  });
});

// region | Helpers

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function list(args: string[]) {
  using io = captureStdio();

  const exitCode = await listCommand(args);

  return { exitCode, stdout: io.stdout, stdoutChunks: io.stdoutChunks, stderr: io.stderr };
}

// endregion | Helpers
