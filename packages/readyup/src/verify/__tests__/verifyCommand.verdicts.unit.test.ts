import { beforeEach, describe, expect, it } from 'vitest';

import { richFormatter } from '../../layout/formatter.ts';
import { createVerifyFakes, type VerifyFakes } from '../test-utils/createVerifyFakes.ts';
import { verify } from '../test-utils/verify-harness.ts';
import { verifyCommand } from '../verifyCommand.ts';

const OK = richFormatter.tokens.passed.text;
const FAILED = richFormatter.tokens.failedError.text;

describe(verifyCommand, () => {
  let fakes: VerifyFakes;

  beforeEach(() => {
    fakes = createVerifyFakes();
  });

  describe('source verdict', () => {
    /** Arranges a manifest naming one kit, with whatever hashes the caller wants to imply. */
    function arrangeSingleKit(): void {
      fakes.readManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' }],
      });
      fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
    }

    it('fails a kit whose source changed without a recompile', async () => {
      arrangeSingleKit();
      fakes.checkSourceDrift.mockReturnValue({
        kind: 'stale',
        expected: '5555aaaa',
        actual: '6666bbbb',
        resolvedPath: '/abs/alpha.ts',
      });

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} alpha\n   source stale (expected 5555aaaa, got 6666bbbb)`);
    });

    it('fails a kit whose recorded source file is gone', async () => {
      arrangeSingleKit();
      fakes.checkSourceDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/alpha.ts' });

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} alpha\n   source file missing (expected alpha.ts)`);
    });

    it('passes a kit whose source matches, leaving the line unchanged', async () => {
      arrangeSingleKit();
      fakes.checkSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('passes a manifest that records no source hash, leaving the line unchanged', async () => {
      arrangeSingleKit();

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('reports both verdicts when the source is stale and the target has drifted', async () => {
      arrangeSingleKit();
      fakes.checkDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      });
      fakes.checkSourceDrift.mockReturnValue({
        kind: 'stale',
        expected: '5555aaaa',
        actual: '6666bbbb',
        resolvedPath: '/abs/alpha.ts',
      });

      const { exitCode, stdout } = await verify([], fakes);

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
      fakes.readManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' }],
      });
      fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      fakes.checkSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });
    }

    it('fails a kit whose inlined module has changed, naming the file and its kind', async () => {
      arrangeSingleKit();
      fakes.checkInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          { kind: 'module', path: 'kits/shared.ts', reason: 'changed', expected: '1111aaaa', actual: '2222bbbb' },
        ],
      });

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(
        `${FAILED} alpha\n   input stale: kits/shared.ts (module, expected 1111aaaa, got 2222bbbb)`,
      );
    });

    it('names a changed inline projection as inline, apart from a changed module', async () => {
      arrangeSingleKit();
      fakes.checkInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          { kind: 'inline', path: '../../package.json', reason: 'changed', expected: '3333cccc', actual: '4444dddd' },
        ],
      });

      const { stdout } = await verify([], fakes);

      expect(stdout).toContain('input stale: ../../package.json (inline, expected 3333cccc, got 4444dddd)');
    });

    it('reports a picked field that has vanished with what went wrong rather than a pair of hashes', async () => {
      arrangeSingleKit();
      fakes.checkInputDrift.mockReturnValue({
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

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('input unprojectable: ../../package.json (path not found: version)');
    });

    it('reports an input read by the compile that is gone', async () => {
      arrangeSingleKit();
      fakes.checkInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [{ kind: 'module', path: 'kits/shared.ts', reason: 'missing' }],
      });

      const { stdout } = await verify([], fakes);

      expect(stdout).toContain('input missing: kits/shared.ts (module)');
    });

    it('gives every failed input its own line beneath the kit', async () => {
      arrangeSingleKit();
      fakes.checkInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [
          { kind: 'module', path: 'kits/shared.ts', reason: 'missing' },
          { kind: 'inline', path: '../../package.json', reason: 'changed', expected: '3333cccc', actual: '4444dddd' },
        ],
      });

      const { stdout } = await verify([], fakes);

      expect(stdout).toContain(
        `${FAILED} alpha\n   input missing: kits/shared.ts (module)\n` +
          '   input stale: ../../package.json (inline, expected 3333cccc, got 4444dddd)',
      );
    });

    it('passes a kit whose inputs match, leaving the line unchanged', async () => {
      arrangeSingleKit();
      fakes.checkInputDrift.mockReturnValue({ kind: 'ok' });

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('passes an entry that predates the closure, leaving the line that it produces today unchanged', async () => {
      arrangeSingleKit();

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
    });

    it('reports a passing rebuild over a stale input, because the rebuild then names the manifest as what went wrong', async () => {
      arrangeSingleKit();
      fakes.checkInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [{ kind: 'module', path: 'kits/shared.ts', reason: 'missing' }],
      });
      fakes.checkRebuild.mockResolvedValue({ kind: 'ok' });

      const { stdout } = await verify(['--rebuild'], fakes);

      expect(stdout).toContain('rebuild ok');
    });
  });
});
