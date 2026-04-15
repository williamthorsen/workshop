import assert from 'node:assert';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { listCommand } from '../../src/list/listCommand.ts';

const mockEnumerateKits = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());

vi.mock('../../src/list/enumerateKits.ts', () => ({
  enumerateKits: mockEnumerateKits,
}));

vi.mock('../../src/loadConfig.ts', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock('../../src/manifest/readManifest.ts', () => ({
  readManifest: mockReadManifest,
}));

describe(listCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    mockEnumerateKits.mockReturnValue([]);
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockEnumerateKits.mockReset();
    mockLoadConfig.mockReset();
    mockReadManifest.mockReset();
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
});
