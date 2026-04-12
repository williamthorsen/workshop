import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { listCommand } from '../../src/list/listCommand.ts';

const mockEnumerateKits = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());

vi.mock('../../src/list/enumerateKits.ts', () => ({
  enumerateKits: mockEnumerateKits,
}));

vi.mock('../../src/loadConfig.ts', () => ({
  loadConfig: mockLoadConfig,
}));

describe(listCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    mockEnumerateKits.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockEnumerateKits.mockReset();
    mockLoadConfig.mockReset();
  });

  it('with --from global, enumerates kits from the home-based .rdy/kits directory', async () => {
    mockEnumerateKits.mockReturnValue(['default']);

    const exitCode = await listCommand(['--from', 'global']);

    expect(exitCode).toBe(0);
    const calledDir = mockEnumerateKits.mock.calls[0][0].dir as string;
    expect(calledDir).toMatch(/\/.rdy\/kits$/);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('with --from dir:/some/path, enumerates kits from the resolved absolute path', async () => {
    mockEnumerateKits.mockReturnValue(['my-kit']);

    const exitCode = await listCommand(['--from', 'dir:/some/path']);

    expect(exitCode).toBe(0);
    const calledDir = mockEnumerateKits.mock.calls[0][0].dir as string;
    expect(calledDir).toBe(path.resolve('/some/path'));
    // Directory source does not append .rdy/kits.
    expect(calledDir).not.toContain('.rdy/kits');
  });

  it('with --from <local-path>, enumerates kits from .rdy/kits under the local path', async () => {
    mockEnumerateKits.mockReturnValue(['default']);

    const exitCode = await listCommand(['--from', '/some/repo']);

    expect(exitCode).toBe(0);
    const calledDir = mockEnumerateKits.mock.calls[0][0].dir as string;
    expect(calledDir).toBe(path.join(path.resolve('/some/repo'), '.rdy/kits'));
  });

  it('returns exit code 1 with a user-readable error for malformed --from values', async () => {
    const exitCode = await listCommand(['--from', 'http://example.com']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('URLs are not accepted by --from'));
    expect(mockEnumerateKits).not.toHaveBeenCalled();
  });
});
