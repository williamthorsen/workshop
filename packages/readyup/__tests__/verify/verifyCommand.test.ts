import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());

vi.mock('../../src/manifest/readManifest.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

vi.mock('../../src/verify/checkDrift.ts', () => ({
  checkDrift: mockCheckDrift,
}));

import { verifyCommand } from '../../src/verify/verifyCommand.ts';

describe(verifyCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockReadManifest.mockReset();
    mockCheckDrift.mockReset();
  });

  it('returns 0 when every kit is ok', () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [
        { name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' },
        { name: 'beta', path: 'beta.js', targetHash: 'bbbb2222' },
      ],
    });
    mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });

    const exitCode = verifyCommand([]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('✅ alpha — ok'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('✅ beta — ok'));
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('failed verification'));
  });

  it('returns 1 when any kit has drift', () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [
        { name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' },
        { name: 'beta', path: 'beta.js', targetHash: 'bbbb2222' },
      ],
    });
    mockCheckDrift
      .mockReturnValueOnce({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      })
      .mockReturnValueOnce({ kind: 'ok', targetHash: 'bbbb2222' });

    const exitCode = verifyCommand([]);

    expect(exitCode).toBe(1);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('⚠️  alpha — drift'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('expected aaaa1111, got aaaa9999'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('1 of 2 kits failed verification'));
  });

  it('returns 1 when any kit is missing', () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' }],
    });
    mockCheckDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/alpha.js' });

    const exitCode = verifyCommand([]);

    expect(exitCode).toBe(1);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('❓ alpha — compiled file missing'));
  });

  it('returns 0 when a kit is unverified (no targetHash)', () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js' }],
    });
    mockCheckDrift.mockReturnValue({ kind: 'unverified' });

    const exitCode = verifyCommand([]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('➖ alpha — unverified'));
  });

  it('returns 0 and reports no-kits message when the manifest is empty', () => {
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });

    const exitCode = verifyCommand([]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('(no kits in manifest)'));
    expect(mockCheckDrift).not.toHaveBeenCalled();
  });

  it('returns 1 when the manifest cannot be read', () => {
    mockReadManifest.mockImplementation(() => {
      throw new Error('Manifest file not found: /path/to/manifest.json');
    });

    const exitCode = verifyCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Manifest file not found'));
  });

  it('honors --manifest flag to resolve a custom path', () => {
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });

    verifyCommand(['--manifest', 'custom/manifest.json']);

    expect(mockReadManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'));
  });

  it('returns 1 when positional arguments are supplied', () => {
    const exitCode = verifyCommand(['unexpected']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('does not accept positional arguments'));
  });
});
