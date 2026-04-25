import assert from 'node:assert';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockEnumerateKits = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
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

vi.mock('../../src/resolveGitHubToken.ts', () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.stubGlobal('fetch', mockFetch);

import { listCommand } from '../../src/list/listCommand.ts';

/** Build a minimal mock Response with the given body and status. */
function mockResponse(
  body: string,
  init?: { status?: number; statusText?: string },
): Pick<Response, 'ok' | 'status' | 'statusText' | 'text' | 'headers'> {
  return {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    text: () => Promise.resolve(body),
    headers: new Headers(),
  };
}

const validRemoteManifestBody = JSON.stringify({
  version: 1,
  kits: [{ name: 'default', description: 'General project health checks' }, { name: 'deploy' }],
});

describe(listCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    mockEnumerateKits.mockReturnValue([]);
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });
    mockResolveGitHubToken.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockEnumerateKits.mockReset();
    mockLoadConfig.mockReset();
    mockReadManifest.mockReset();
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

  it('returns exit code 1 with a user-readable error for malformed --from values', async () => {
    const exitCode = await listCommand(['--from', 'http://example.com']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('URLs are not accepted by --from'));
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

  it('with --from github:... and a 404 response, writes an actionable stderr message', async () => {
    mockFetch.mockResolvedValue(mockResponse('Not Found', { status: 404, statusText: 'Not Found' }));

    const exitCode = await listCommand(['--from', 'github:williamthorsen/workshop']);

    expect(exitCode).toBe(1);
    const stderrCalls = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrCalls).toContain(
      'Error: No manifest found at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json. Has `rdy compile --with-manifest` been run?',
    );
  });

  it('with --from github:... and an HTML soft-404 body, writes an actionable stderr message', async () => {
    mockFetch.mockResolvedValue(mockResponse('<!DOCTYPE html><html><body>Not Found</body></html>'));

    const exitCode = await listCommand(['--from', 'github:williamthorsen/workshop']);

    expect(exitCode).toBe(1);
    const stderrCalls = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrCalls).toContain(
      'Error: No manifest found at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json. Has `rdy compile --with-manifest` been run?',
    );
  });

  it('with --from github:... and a malformed manifest, writes a stderr message including the URL and "malformed"', async () => {
    mockFetch.mockResolvedValue(mockResponse('{ not valid json'));

    const exitCode = await listCommand(['--from', 'github:williamthorsen/workshop']);

    expect(exitCode).toBe(1);
    const stderrCalls = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrCalls).toContain(
      'Manifest at https://raw.githubusercontent.com/williamthorsen/workshop/main/.readyup/manifest.json is malformed:',
    );
  });
});
