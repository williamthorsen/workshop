import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());
const mockCheckInputDrift = vi.hoisted(() => vi.fn());
const mockCheckSourceDrift = vi.hoisted(() => vi.fn());
const mockCheckRebuild = vi.hoisted(() => vi.fn());
const mockLoadEsbuild = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());

vi.mock(import('../../manifest/readManifest.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return { ...actual, loadConfig: mockLoadConfig };
});

vi.mock(import('../checkDrift.ts'), () => ({
  checkDrift: mockCheckDrift,
}));

vi.mock(import('../checkInputDrift.ts'), () => ({
  checkInputDrift: mockCheckInputDrift,
}));

vi.mock(import('../checkSourceDrift.ts'), () => ({
  checkSourceDrift: mockCheckSourceDrift,
}));

vi.mock(import('../checkRebuild.ts'), () => ({
  checkRebuild: mockCheckRebuild,
}));

vi.mock(import('../../compile/loadEsbuild.ts'), () => ({
  loadEsbuild: mockLoadEsbuild,
}));

vi.mock(import('../../portable/buildInstallCommand.ts'), () => ({
  buildInstallCommand: (moduleName: string) => `npm install --save-dev ${moduleName}`,
}));

import { richFormatter } from '../../layout/formatter.ts';
import { buildConfig, verify } from '../test-utils/verify-harness.ts';
import { verifyCommand } from '../verifyCommand.ts';

const OK = richFormatter.tokens.passed.text;
const FAILED = richFormatter.tokens.failedError.text;

/** A source directory that does not exist, so that a test which writes no sources selects none. */
const ABSENT_SRC_DIR = '/nonexistent/readyup-verify-sources';

describe(verifyCommand, () => {
  beforeEach(() => {
    mockCheckInputDrift.mockReturnValue({ kind: 'unverified' });
    mockCheckSourceDrift.mockReturnValue({ kind: 'unverified' });
    mockLoadEsbuild.mockResolvedValue({ build: vi.fn() });
    mockLoadConfig.mockResolvedValue(buildConfig(ABSENT_SRC_DIR));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockReadManifest.mockReset();
    mockCheckDrift.mockReset();
    mockCheckInputDrift.mockReset();
    mockCheckSourceDrift.mockReset();
    mockCheckRebuild.mockReset();
    mockLoadEsbuild.mockReset();
    mockLoadConfig.mockReset();
  });

  describe('source verdict', () => {
    /** Arranges a manifest naming one kit, with whatever hashes the caller wants to imply. */
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

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} alpha\n   source stale (expected 5555aaaa, got 6666bbbb)`);
    });

    it('fails a kit whose recorded source file is gone', async () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/alpha.ts' });

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} alpha\n   source file missing (expected alpha.ts)`);
    });

    it('passes a kit whose source matches, leaving the line unchanged', async () => {
      arrangeSingleKit();
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('passes a manifest that records no source hash, leaving the line unchanged', async () => {
      arrangeSingleKit();

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
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

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(
        `${FAILED} alpha\n   drift (expected aaaa1111, got aaaa9999)\n   source stale (expected 5555aaaa, got 6666bbbb)`,
      );
    });
  });

  describe('inputs verdict', () => {
    /**
     * Arranges a manifest naming one kit whose two hash verdicts both pass, leaving the inputs axis as the only one
     * under test.
     */
    function arrangeSingleKit(): void {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' }],
      });
      mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });
    }

    it('fails a kit whose inlined module has changed, naming the file and its kind', async () => {
      arrangeSingleKit();
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          { kind: 'module', path: 'kits/shared.ts', reason: 'changed', expected: '1111aaaa', actual: '2222bbbb' },
        ],
      });

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(
        `${FAILED} alpha\n   input stale: kits/shared.ts (module, expected 1111aaaa, got 2222bbbb)`,
      );
    });

    it('names a changed inline projection as inline, apart from a changed module', async () => {
      arrangeSingleKit();
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          { kind: 'inline', path: '../../package.json', reason: 'changed', expected: '3333cccc', actual: '4444dddd' },
        ],
      });

      const { stdout } = await verify([]);

      expect(stdout).toContain('input stale: ../../package.json (inline, expected 3333cccc, got 4444dddd)');
    });

    it('reports a picked field that has vanished with what went wrong rather than a pair of hashes', async () => {
      arrangeSingleKit();
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          {
            kind: 'inline',
            path: '../../package.json',
            reason: 'unprojectable',
            detail: 'path not found: version',
          },
        ],
      });

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('input unprojectable: ../../package.json (path not found: version)');
    });

    it('reports an input read by the compile that is gone', async () => {
      arrangeSingleKit();
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [{ kind: 'module', path: 'kits/shared.ts', reason: 'missing' }],
      });

      const { stdout } = await verify([]);

      expect(stdout).toContain('input missing: kits/shared.ts (module)');
    });

    it('gives every failed input its own line beneath the kit', async () => {
      arrangeSingleKit();
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          { kind: 'module', path: 'kits/shared.ts', reason: 'missing' },
          { kind: 'inline', path: '../../package.json', reason: 'changed', expected: '3333cccc', actual: '4444dddd' },
        ],
      });

      const { stdout } = await verify([]);

      expect(stdout).toContain(
        `${FAILED} alpha\n   input missing: kits/shared.ts (module)\n` +
          '   input stale: ../../package.json (inline, expected 3333cccc, got 4444dddd)',
      );
    });

    it('passes a kit whose inputs match, leaving the line unchanged', async () => {
      arrangeSingleKit();
      mockCheckInputDrift.mockReturnValue({ kind: 'ok' });

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('passes an entry that predates the closure, leaving the line that it produces today unchanged', async () => {
      arrangeSingleKit();

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('reports a passing rebuild over a stale input, because the rebuild then names the manifest as what went wrong', async () => {
      arrangeSingleKit();
      mockCheckInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [{ kind: 'module', path: 'kits/shared.ts', reason: 'missing' }],
      });
      mockCheckRebuild.mockResolvedValue({ kind: 'ok' });

      const { stdout } = await verify(['--rebuild']);

      expect(stdout).toContain('rebuild ok');
    });
  });
});
