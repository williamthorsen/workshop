import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());
const mockCheckSourceDrift = vi.hoisted(() => vi.fn());

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

vi.mock('../../src/verify/checkSourceDrift.ts', () => ({
  checkSourceDrift: mockCheckSourceDrift,
}));

import { verifyCommand } from '../../src/verify/verifyCommand.ts';
import { captureRdyError } from '../helpers/captureRdyError.ts';

describe(verifyCommand, () => {
  let stdoutSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockCheckSourceDrift.mockReturnValue({ kind: 'unverified' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockReadManifest.mockReset();
    mockCheckDrift.mockReset();
    mockCheckSourceDrift.mockReset();
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

  describe('source verdict', () => {
    /** A manifest naming one kit, with whatever hashes the caller wants to imply. */
    function arrangeSingleKit(): void {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' }],
      });
      mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
    }

    it('fails a kit whose source changed without a recompile', () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({
        kind: 'stale',
        expected: '5555aaaa',
        actual: '6666bbbb',
        resolvedPath: '/abs/alpha.ts',
      });

      const exitCode = verifyCommand([]);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  alpha — ok; source stale (expected 5555aaaa, got 6666bbbb)'),
      );
    });

    it('fails a kit whose recorded source file is gone', () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/alpha.ts' });

      const exitCode = verifyCommand([]);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('❓ alpha — ok; source file missing (expected alpha.ts)'),
      );
    });

    it('passes a kit whose source matches, leaving the line unchanged', () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });

      const exitCode = verifyCommand([]);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('✅ alpha — ok\n'));
    });

    it('passes a manifest that records no source hash, leaving the line unchanged', () => {
      arrangeSingleKit();

      const exitCode = verifyCommand([]);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('✅ alpha — ok\n'));
    });

    it('reports both verdicts when the source is stale and the target has drifted', () => {
      arrangeSingleKit();
      mockCheckDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      });
      mockCheckSourceDrift.mockReturnValue({
        kind: 'stale',
        expected: '5555aaaa',
        actual: '6666bbbb',
        resolvedPath: '/abs/alpha.ts',
      });

      const exitCode = verifyCommand([]);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'alpha — drift (expected aaaa1111, got aaaa9999); source stale (expected 5555aaaa, got 6666bbbb)',
        ),
      );
    });
  });

  it('reports a config error when the manifest cannot be read', async () => {
    mockReadManifest.mockImplementation(() => {
      throw new Error('Manifest file not found: /path/to/manifest.json');
    });

    const error = await captureRdyError(() => verifyCommand([]));

    expect(error.code).toBe('config');
    expect(error.message).toContain('Manifest file not found');
  });

  it('honors --manifest flag to resolve a custom path', () => {
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });

    verifyCommand(['--manifest', 'custom/manifest.json']);

    expect(mockReadManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'));
  });

  it('reports a usage error when positional arguments are supplied', async () => {
    const error = await captureRdyError(() => verifyCommand(['unexpected']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain('does not accept positional arguments');
  });
});
