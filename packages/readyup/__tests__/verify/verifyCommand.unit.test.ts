import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());
const mockCheckSourceDrift = vi.hoisted(() => vi.fn());
const mockCheckRebuild = vi.hoisted(() => vi.fn());
const mockLoadEsbuild = vi.hoisted(() => vi.fn());

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

vi.mock(import('../../src/verify/checkRebuild.ts'), () => ({
  checkRebuild: mockCheckRebuild,
}));

vi.mock(import('../../src/compile/loadEsbuild.ts'), () => ({
  loadEsbuild: mockLoadEsbuild,
}));

import { richFormatter } from '../../src/layout/richFormatter.ts';
import { captureRdyError } from '../../src/test-utils/captureRdyError.ts';
import { verifyCommand } from '../../src/verify/verifyCommand.ts';
import { VERSION } from '../../src/version.ts';

const OK = richFormatter.tokens.passed.glyph;
const FAILED = richFormatter.tokens.failedError.glyph;
const UNVERIFIED = richFormatter.tokens.skippedOptional.glyph;

describe(verifyCommand, () => {
  let stdoutSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockCheckSourceDrift.mockReturnValue({ kind: 'unverified' });
    mockLoadEsbuild.mockResolvedValue({ build: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockReadManifest.mockReset();
    mockCheckDrift.mockReset();
    mockCheckSourceDrift.mockReset();
    mockCheckRebuild.mockReset();
    mockLoadEsbuild.mockReset();
  });

  it('returns 0 when every kit is ok', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [
        { name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' },
        { name: 'beta', path: 'beta.js', targetHash: 'bbbb2222' },
      ],
    });
    mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });

    const exitCode = await verifyCommand([]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${OK} alpha`));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${OK} beta`));
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('failed verification'));
  });

  it('returns 1 when any kit has drift', async () => {
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

    const exitCode = await verifyCommand([]);

    expect(exitCode).toBe(1);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${FAILED} alpha\n   drift`));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('expected aaaa1111, got aaaa9999'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('1 of 2 kits failed verification'));
  });

  it('returns 1 when any kit is missing', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' }],
    });
    mockCheckDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/alpha.js' });

    const exitCode = await verifyCommand([]);

    expect(exitCode).toBe(1);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${FAILED} alpha\n   compiled file missing`));
  });

  it('returns 0 when a kit is unverified (no targetHash)', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js' }],
    });
    mockCheckDrift.mockReturnValue({ kind: 'unverified' });

    const exitCode = await verifyCommand([]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${UNVERIFIED} alpha \u{00B7} unverified`));
  });

  it('returns 0 and reports no-kits message when the manifest is empty', async () => {
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });

    const exitCode = await verifyCommand([]);

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

    it('fails a kit whose source changed without a recompile', async () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({
        kind: 'stale',
        expected: '5555aaaa',
        actual: '6666bbbb',
        resolvedPath: '/abs/alpha.ts',
      });

      const exitCode = await verifyCommand([]);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${FAILED} alpha\n   source stale (expected 5555aaaa, got 6666bbbb)`),
      );
    });

    it('fails a kit whose recorded source file is gone', async () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/alpha.ts' });

      const exitCode = await verifyCommand([]);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${FAILED} alpha\n   source file missing (expected alpha.ts)`),
      );
    });

    it('passes a kit whose source matches, leaving the line unchanged', async () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });

      const exitCode = await verifyCommand([]);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${OK} alpha\n`));
    });

    it('passes a manifest that records no source hash, leaving the line unchanged', async () => {
      arrangeSingleKit();

      const exitCode = await verifyCommand([]);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${OK} alpha\n`));
    });

    it('reports both verdicts when the source is stale and the target has drifted', async () => {
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

      const exitCode = await verifyCommand([]);

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

  it('honors --manifest flag to resolve a custom path', async () => {
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });

    await verifyCommand(['--manifest', 'custom/manifest.json']);

    expect(mockReadManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'));
  });

  it('reports a usage error when positional arguments are supplied', async () => {
    const error = await captureRdyError(() => verifyCommand(['unexpected']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain('does not accept positional arguments');
  });

  describe('rebuild verdict', () => {
    /** A manifest naming one fully recorded kit whose two hash verdicts both pass. */
    function arrangeSingleKit(): void {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' }],
      });
      mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });
    }

    it('leaves the run untouched without the flag, never reaching for esbuild', async () => {
      arrangeSingleKit();

      const exitCode = await verifyCommand([]);

      expect(exitCode).toBe(0);
      expect(mockCheckRebuild).not.toHaveBeenCalled();
      expect(mockLoadEsbuild).not.toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalledWith(`${OK} alpha\n`);
    });

    it('passes a kit that reproduces, leaving its line unchanged', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'ok' });

      const exitCode = await verifyCommand(['--rebuild']);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(`${OK} alpha\n`);
    });

    it('fails a kit whose bundle differs from what its source rebuilds to', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      const exitCode = await verifyCommand(['--rebuild']);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${FAILED} alpha\n   rebuild mismatch (rebuilt 1111aaaa, on disk 2222bbbb)`),
      );
    });

    it('names both versions on a mismatch spanning a readyup move', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        compiledWith: '0.0.1-old',
      });

      await verifyCommand(['--rebuild']);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining(`compiled by readyup 0.0.1-old, rebuilt by ${VERSION}`),
      );
    });

    it('fails a kit whose source no longer compiles, carrying the compile error', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'failed', message: 'Unexpected token' });

      const exitCode = await verifyCommand(['--rebuild']);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('rebuild failed (Unexpected token)'));
    });

    it('fails a kit that cannot be rebuilt rather than waiving it', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'missing', reason: 'no source recorded in manifest' });

      const exitCode = await verifyCommand(['--rebuild']);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('cannot rebuild (no source recorded in manifest)'),
      );
    });

    it('states a passing rebuild beside a failing hash verdict, where it changes the reading', async () => {
      arrangeSingleKit();
      mockCheckDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      });
      mockCheckRebuild.mockResolvedValue({ kind: 'ok' });

      const exitCode = await verifyCommand(['--rebuild']);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('drift (expected aaaa1111, got aaaa9999)'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('rebuild ok'));
    });

    it('carries the rebuild verdict and its hashes in the JSON payload', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      await verifyCommand(['--rebuild', '--json']);

      const payload: unknown = JSON.parse(String(stdoutSpy.mock.calls.at(-1)?.[0]));
      expect(payload).toMatchObject({
        passed: false,
        kits: [{ name: 'alpha', rebuildStatus: 'mismatch', rebuildExpected: '1111aaaa', rebuildActual: '2222bbbb' }],
      });
    });

    it('carries the compile error in the JSON payload for a kit that failed to build', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'failed', message: 'Unexpected token' });

      await verifyCommand(['--rebuild', '--json']);

      const payload: unknown = JSON.parse(String(stdoutSpy.mock.calls.at(-1)?.[0]));
      expect(payload).toMatchObject({ kits: [{ rebuildStatus: 'failed', rebuildError: 'Unexpected token' }] });
    });

    it('omits every rebuild field from the JSON payload without the flag', async () => {
      arrangeSingleKit();

      await verifyCommand(['--json']);

      const payload = String(stdoutSpy.mock.calls.at(-1)?.[0]);
      expect(payload).not.toContain('rebuild');
    });

    it('reports a config error naming the install command when esbuild is absent', async () => {
      arrangeSingleKit();
      mockLoadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

      const error = await captureRdyError(() => verifyCommand(['--rebuild']));

      expect(error.code).toBe('config');
      expect(error.message).toContain('pnpm add --save-dev esbuild');
    });

    it('raises the absent-esbuild error before any kit is reported', async () => {
      arrangeSingleKit();
      mockLoadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

      await captureRdyError(() => verifyCommand(['--rebuild']));

      expect(mockReadManifest).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('verifies without esbuild when the flag is absent', async () => {
      arrangeSingleKit();
      mockLoadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

      const exitCode = await verifyCommand([]);

      expect(exitCode).toBe(0);
    });
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
      async (retired) => {
        for (const verdict of verdicts) {
          mockReadManifest.mockReturnValue({
            version: 1,
            kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111', source: 'alpha.ts' }],
          });
          mockCheckDrift.mockReturnValue(verdict);
          await verifyCommand([]);
        }

        const written = stdoutSpy.mock.calls.flat().join('\n');
        expect(written).not.toContain(retired);
      },
    );

    it('renders a section heading rather than a colon-terminated header', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      await verifyCommand([]);

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('\u{2500}\u{2500} Verifying kits against '));
    });

    it('leaves a wholly verified kit carrying nothing beyond its token', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111', source: 'alpha.ts', sourceHash: '5555aaaa' }],
      });
      mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });

      await verifyCommand([]);

      expect(stdoutSpy).toHaveBeenCalledWith(`${OK} alpha\n`);
    });
  });
});
