import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());
const mockCheckSourceDrift = vi.hoisted(() => vi.fn());

vi.mock(import('../../src/manifest/readManifest.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

vi.mock(import('../../src/verify/checkDrift.ts'), () => ({
  checkDrift: mockCheckDrift,
}));

vi.mock(import('../../src/verify/checkSourceDrift.ts'), () => ({
  checkSourceDrift: mockCheckSourceDrift,
}));

import { richFormatter } from '../../src/layout/richFormatter.ts';
import { captureRdyError } from '../../src/test-utils/captureRdyError.ts';
import { verifyCommand } from '../../src/verify/verifyCommand.ts';

const OK = richFormatter.tokens.passed.glyph;
const FAILED = richFormatter.tokens.failedError.glyph;
const UNVERIFIED = richFormatter.tokens.skippedOptional.glyph;

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
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${OK} alpha`));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${OK} beta`));
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
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${FAILED} alpha\n   drift`));
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
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${FAILED} alpha\n   compiled file missing`));
  });

  it('returns 0 when a kit is unverified (no targetHash)', () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js' }],
    });
    mockCheckDrift.mockReturnValue({ kind: 'unverified' });

    const exitCode = verifyCommand([]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${UNVERIFIED} alpha \u{00B7} unverified`));
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
        expect.stringContaining(`${FAILED} alpha\n   source stale (expected 5555aaaa, got 6666bbbb)`),
      );
    });

    it('fails a kit whose recorded source file is gone', () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/alpha.ts' });

      const exitCode = verifyCommand([]);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${FAILED} alpha\n   source file missing (expected alpha.ts)`),
      );
    });

    it('passes a kit whose source matches, leaving the line unchanged', () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });

      const exitCode = verifyCommand([]);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${OK} alpha\n`));
    });

    it('passes a manifest that records no source hash, leaving the line unchanged', () => {
      arrangeSingleKit();

      const exitCode = verifyCommand([]);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${OK} alpha\n`));
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
          `${FAILED} alpha\n   drift (expected aaaa1111, got aaaa9999)\n   source stale (expected 5555aaaa, got 6666bbbb)`,
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

  describe('unified vocabulary', () => {
    /** Every verdict the command can report, so one sweep covers each line it produces. */
    const verdicts = [
      { kind: 'ok', targetHash: 'aaaa1111' },
      { kind: 'drift', expected: 'aaaa1111', actual: 'aaaa9999', resolvedPath: '/abs/alpha.js' },
      { kind: 'missing', resolvedPath: '/abs/alpha.js' },
      { kind: 'unverified' },
    ];

    it.each(['\u{2705}', '\u{26A0}', '\u{2753}', '\u{2796}', '\u{FE0F}', '\u{2014}'])(
      'renders no %s for any verdict',
      (retired) => {
        for (const verdict of verdicts) {
          mockReadManifest.mockReturnValue({
            version: 1,
            kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111', source: 'alpha.ts' }],
          });
          mockCheckDrift.mockReturnValue(verdict);
          verifyCommand([]);
        }

        const written = stdoutSpy.mock.calls.flat().join('\n');
        expect(written).not.toContain(retired);
      },
    );

    it('renders a section heading rather than a colon-terminated header', () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      verifyCommand([]);

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('\u{2500}\u{2500} Verifying kits against '));
    });

    it('leaves a wholly verified kit carrying nothing beyond its token', () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111', source: 'alpha.ts', sourceHash: '5555aaaa' }],
      });
      mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });

      verifyCommand([]);

      expect(stdoutSpy).toHaveBeenCalledWith(`${OK} alpha\n`);
    });
  });
});
