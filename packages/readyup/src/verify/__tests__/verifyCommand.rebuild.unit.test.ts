import { beforeEach, describe, expect, it } from 'vitest';

import { buildEsbuildInstallHint } from '../../compile/buildBundle.ts';
import { richFormatter } from '../../layout/formatter.ts';
import { VERSION } from '../../version.ts';
import { createVerifyFakes, type VerifyFakes } from '../test-utils/createVerifyFakes.ts';
import { verify, verifyRaising } from '../test-utils/verify-harness.ts';
import { verifyCommand } from '../verifyCommand.ts';

const OK = richFormatter.tokens.passed.text;
const FAILED = richFormatter.tokens.failedError.text;
const UNVERIFIED = richFormatter.tokens.skippedOptional.text;

describe(verifyCommand, () => {
  let fakes: VerifyFakes;

  beforeEach(() => {
    fakes = createVerifyFakes();
  });

  describe('rebuild verdict', () => {
    /** Arranges a manifest naming one fully recorded kit whose two hash verdicts both pass. */
    function arrangeSingleKit(): void {
      fakes.readManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' }],
      });
      fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      fakes.checkSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });
    }

    it('leaves the run untouched without the flag, never loading esbuild', async () => {
      arrangeSingleKit();

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(0);
      expect(fakes.checkRebuild).not.toHaveBeenCalled();
      expect(fakes.loadEsbuild).not.toHaveBeenCalled();
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('passes a kit that reproduces, leaving its line unchanged', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({ kind: 'ok' });

      const { exitCode, stdout } = await verify(['--rebuild'], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('fails a kit whose bundle differs from what its source rebuilds to', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      const { exitCode, stdout } = await verify(['--rebuild'], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} alpha\n   rebuild mismatch (rebuilt 1111aaaa, on disk 2222bbbb)`);
    });

    it('names both versions on a mismatch spanning a readyup move', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        compiledWith: '0.0.1-old',
      });

      const { stdout } = await verify(['--rebuild'], fakes);

      expect(stdout).toContain(`compiled by readyup 0.0.1-old, rebuilt by ${VERSION}`);
    });

    it('names the esbuild move on a mismatch whose recorded version differs', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        esbuild: { recorded: '0.28.1', rebuilt: '0.29.0' },
      });

      const { stdout } = await verify(['--rebuild'], fakes);

      expect(stdout).toContain('esbuild 0.28.1 -> 0.29.0');
    });

    it('names each dependency change on a mismatch, one clause apiece', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({
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

      const { stdout } = await verify(['--rebuild'], fakes);

      expect(stdout).toContain('glob 10.0.0 no longer bundled');
      expect(stdout).toContain('picomatch 4.0.2 newly bundled');
      expect(stdout).toContain('zod 3.24.1 -> 4.0.0');
    });

    it('says the recorded versions match when the toolchain record rules out every named cause', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        esbuild: { recorded: '0.29.0', rebuilt: '0.29.0' },
      });

      const { stdout } = await verify(['--rebuild'], fakes);

      expect(stdout).toContain('recorded esbuild and dependency versions match the rebuild');
    });

    it('reports the esbuild comparison and dependency changes in the JSON payload', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        esbuild: { recorded: '0.28.1', rebuilt: '0.29.0' },
        dependencyChanges: [{ name: 'zod', recorded: '3.24.1', rebuilt: '4.0.0' }],
      });

      const { stdout } = await verify(['--rebuild', '--json'], fakes);

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
      fakes.checkRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      const { stdout } = await verify(['--rebuild', '--json'], fakes);

      expect(stdout).not.toContain('rebuildEsbuild');
      expect(stdout).not.toContain('rebuildDependencyChanges');
    });

    it('fails a kit whose source no longer compiles, with the compile error', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({ kind: 'failed', message: 'Unexpected token' });

      const { exitCode, stdout } = await verify(['--rebuild'], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('rebuild failed (Unexpected token)');
    });

    it('fails a kit that cannot be rebuilt rather than waiving it', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({ kind: 'missing', reason: 'no source recorded in manifest' });

      const { exitCode, stdout } = await verify(['--rebuild'], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('cannot rebuild (no source recorded in manifest)');
    });

    it('states a passing rebuild beside a failing hash verdict, because the pass changes what that verdict means', async () => {
      arrangeSingleKit();
      fakes.checkDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      });
      fakes.checkRebuild.mockResolvedValue({ kind: 'ok' });

      const { exitCode, stdout } = await verify(['--rebuild'], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('drift (expected aaaa1111, got aaaa9999)');
      expect(stdout).toContain('rebuild ok');
    });

    it('reports the rebuild verdict and its hashes in the JSON payload', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      const { stdout } = await verify(['--rebuild', '--json'], fakes);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({
        passed: false,
        kits: [{ name: 'alpha', rebuildStatus: 'mismatch', rebuildExpected: '1111aaaa', rebuildActual: '2222bbbb' }],
      });
    });

    it('reports a passing rebuild over an unverified target, because the rebuild supplies the verdict that the absent hash could not', async () => {
      fakes.readManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts' }],
      });
      fakes.checkDrift.mockReturnValue({ kind: 'unverified' });
      fakes.checkSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });
      fakes.checkRebuild.mockResolvedValue({ kind: 'ok' });

      const { exitCode, stdout } = await verify(['--rebuild'], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha`);
      expect(stdout).toContain('rebuild ok');
    });

    it('keeps the skip token on an unverified target on which the rebuild reached no verdict', async () => {
      fakes.readManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js' }],
      });
      fakes.checkDrift.mockReturnValue({ kind: 'unverified' });

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${UNVERIFIED} alpha`);
    });

    it('reports the compiling version in the JSON payload when it differs from the runner', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({
        kind: 'mismatch',
        expected: '1111aaaa',
        actual: '2222bbbb',
        compiledWith: '0.0.1-old',
      });

      const { stdout } = await verify(['--rebuild', '--json'], fakes);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({ kits: [{ rebuildCompiledWith: '0.0.1-old' }] });
    });

    it('omits the compiling version from the JSON payload when it matches the runner', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({ kind: 'mismatch', expected: '1111aaaa', actual: '2222bbbb' });

      const { stdout } = await verify(['--rebuild', '--json'], fakes);

      expect(stdout).not.toContain('rebuildCompiledWith');
    });

    it('reports the compile error in the JSON payload for a kit that failed to build', async () => {
      arrangeSingleKit();
      fakes.checkRebuild.mockResolvedValue({ kind: 'failed', message: 'Unexpected token' });

      const { stdout } = await verify(['--rebuild', '--json'], fakes);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({ kits: [{ rebuildStatus: 'failed', rebuildError: 'Unexpected token' }] });
    });

    it('omits every rebuild field from the JSON payload without the flag', async () => {
      arrangeSingleKit();

      const { stdout } = await verify(['--json'], fakes);

      expect(stdout).not.toContain('rebuild');
    });

    it("reports a config error naming the project's install command when esbuild is absent", async () => {
      arrangeSingleKit();
      fakes.loadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

      const { error } = await verifyRaising(['--rebuild'], fakes);

      expect(error.code).toBe('config');
      expect(error.message).toContain(buildEsbuildInstallHint());
    });

    it('raises the absent-esbuild error before any kit is reported', async () => {
      arrangeSingleKit();
      fakes.loadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

      const { stdout } = await verifyRaising(['--rebuild'], fakes);

      expect(fakes.readManifest).not.toHaveBeenCalled();
      expect(stdout).toBe('');
    });

    it('verifies without esbuild when the flag is absent', async () => {
      arrangeSingleKit();
      fakes.loadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

      const { exitCode } = await verify([], fakes);

      expect(exitCode).toBe(0);
    });
  });
});
