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
import { VERSION } from '../../version.ts';
import { buildConfig, verify, verifyRaising } from '../test-utils/verify-harness.ts';
import { verifyCommand } from '../verifyCommand.ts';

const OK = richFormatter.tokens.passed.text;
const FAILED = richFormatter.tokens.failedError.text;
const UNVERIFIED = richFormatter.tokens.skippedOptional.text;

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

  describe('rebuild verdict', () => {
    /** Arranges a manifest naming one fully recorded kit whose two hash verdicts both pass. */
    function arrangeSingleKit(): void {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' }],
      });
      mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });
    }

    it('leaves the run untouched without the flag, never loading esbuild', async () => {
      arrangeSingleKit();

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(0);
      expect(mockCheckRebuild).not.toHaveBeenCalled();
      expect(mockLoadEsbuild).not.toHaveBeenCalled();
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('passes a kit that reproduces, leaving its line unchanged', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'ok' });

      const { exitCode, stdout } = await verify(['--rebuild']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('fails a kit whose bundle differs from what its source rebuilds to', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      const { exitCode, stdout } = await verify(['--rebuild']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} alpha\n   rebuild mismatch (rebuilt 1111aaaa, on disk 2222bbbb)`);
    });

    it('names both versions on a mismatch spanning a readyup move', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        compiledWith: '0.0.1-old',
      });

      const { stdout } = await verify(['--rebuild']);

      expect(stdout).toContain(`compiled by readyup 0.0.1-old, rebuilt by ${VERSION}`);
    });

    it('names the esbuild move on a mismatch whose recorded version differs', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        esbuild: { recorded: '0.28.1', rebuilt: '0.29.0' },
      });

      const { stdout } = await verify(['--rebuild']);

      expect(stdout).toContain('esbuild 0.28.1 -> 0.29.0');
    });

    it('names each dependency change on a mismatch, one clause apiece', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        esbuild: { recorded: '0.29.0', rebuilt: '0.29.0' },
        dependencyChanges: [
          { name: 'glob', recorded: '10.0.0' },
          { name: 'picomatch', rebuilt: '4.0.2' },
          { name: 'zod', recorded: '3.24.1', rebuilt: '4.0.0' },
        ],
      });

      const { stdout } = await verify(['--rebuild']);

      expect(stdout).toContain('glob 10.0.0 no longer bundled');
      expect(stdout).toContain('picomatch 4.0.2 newly bundled');
      expect(stdout).toContain('zod 3.24.1 -> 4.0.0');
    });

    it('says the recorded versions match when the toolchain record rules out every named cause', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        esbuild: { recorded: '0.29.0', rebuilt: '0.29.0' },
      });

      const { stdout } = await verify(['--rebuild']);

      expect(stdout).toContain('recorded esbuild and dependency versions match the rebuild');
    });

    it('reports the esbuild comparison and dependency changes in the JSON payload', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        esbuild: { recorded: '0.28.1', rebuilt: '0.29.0' },
        dependencyChanges: [{ name: 'zod', recorded: '3.24.1', rebuilt: '4.0.0' }],
      });

      const { stdout } = await verify(['--rebuild', '--json']);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({
        kits: [
          {
            rebuildEsbuild: { recorded: '0.28.1', rebuilt: '0.29.0' },
            rebuildDependencyChanges: [{ name: 'zod', recorded: '3.24.1', rebuilt: '4.0.0' }],
          },
        ],
      });
    });

    it('omits the toolchain fields from the JSON payload for a mismatch predating the record', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      const { stdout } = await verify(['--rebuild', '--json']);

      expect(stdout).not.toContain('rebuildEsbuild');
      expect(stdout).not.toContain('rebuildDependencyChanges');
    });

    it('fails a kit whose source no longer compiles, with the compile error', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'failed', message: 'Unexpected token' });

      const { exitCode, stdout } = await verify(['--rebuild']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('rebuild failed (Unexpected token)');
    });

    it('fails a kit that cannot be rebuilt rather than waiving it', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'missing', reason: 'no source recorded in manifest' });

      const { exitCode, stdout } = await verify(['--rebuild']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('cannot rebuild (no source recorded in manifest)');
    });

    it('states a passing rebuild beside a failing hash verdict, because the pass changes what that verdict means', async () => {
      arrangeSingleKit();
      mockCheckDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      });
      mockCheckRebuild.mockResolvedValue({ kind: 'ok' });

      const { exitCode, stdout } = await verify(['--rebuild']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('drift (expected aaaa1111, got aaaa9999)');
      expect(stdout).toContain('rebuild ok');
    });

    it('reports the rebuild verdict and its hashes in the JSON payload', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      const { stdout } = await verify(['--rebuild', '--json']);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({
        passed: false,
        kits: [{ name: 'alpha', rebuildStatus: 'mismatch', rebuildExpected: '1111aaaa', rebuildActual: '2222bbbb' }],
      });
    });

    it('reports a passing rebuild over an unverified target, because the rebuild supplies the verdict that the absent hash could not', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts' }],
      });
      mockCheckDrift.mockReturnValue({ kind: 'unverified' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });
      mockCheckRebuild.mockResolvedValue({ kind: 'ok' });

      const { exitCode, stdout } = await verify(['--rebuild']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha`);
      expect(stdout).toContain('rebuild ok');
    });

    it('keeps the skip token on an unverified target on which the rebuild reached no verdict', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js' }],
      });
      mockCheckDrift.mockReturnValue({ kind: 'unverified' });

      const { exitCode, stdout } = await verify([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${UNVERIFIED} alpha`);
    });

    it('reports the compiling version in the JSON payload when it differs from the runner', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        compiledWith: '0.0.1-old',
      });

      const { stdout } = await verify(['--rebuild', '--json']);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({ kits: [{ rebuildCompiledWith: '0.0.1-old' }] });
    });

    it('omits the compiling version from the JSON payload when it matches the runner', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      const { stdout } = await verify(['--rebuild', '--json']);

      expect(stdout).not.toContain('rebuildCompiledWith');
    });

    it('reports the compile error in the JSON payload for a kit that failed to build', async () => {
      arrangeSingleKit();
      mockCheckRebuild.mockResolvedValue({ kind: 'failed', message: 'Unexpected token' });

      const { stdout } = await verify(['--rebuild', '--json']);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({ kits: [{ rebuildStatus: 'failed', rebuildError: 'Unexpected token' }] });
    });

    it('omits every rebuild field from the JSON payload without the flag', async () => {
      arrangeSingleKit();

      const { stdout } = await verify(['--json']);

      expect(stdout).not.toContain('rebuild');
    });

    it("reports a config error naming the project's install command when esbuild is absent", async () => {
      arrangeSingleKit();
      mockLoadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

      const { error } = await verifyRaising(['--rebuild']);

      expect(error.code).toBe('config');
      expect(error.message).toContain('Install it with: npm install --save-dev esbuild');
    });

    it('raises the absent-esbuild error before any kit is reported', async () => {
      arrangeSingleKit();
      mockLoadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

      const { stdout } = await verifyRaising(['--rebuild']);

      expect(mockReadManifest).not.toHaveBeenCalled();
      expect(stdout).toBe('');
    });

    it('verifies without esbuild when the flag is absent', async () => {
      arrangeSingleKit();
      mockLoadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

      const { exitCode } = await verify([]);

      expect(exitCode).toBe(0);
    });
  });
});
